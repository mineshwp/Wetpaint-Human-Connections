import { createHash } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { estimateCost } from "./pricing"

// Server-only OpenAI access for the HR portal. Settings live in ai_settings
// (HR-editable); the API key is in Supabase Vault and never leaves the server.
// Every call is logged in ai_runs and counts toward the monthly spend cap.

export type ReasoningEffort = "none" | "low" | "medium" | "high"

export type AiSettings = {
  actionPointsEnabled: boolean
  includeNames: boolean
  model: string
  reasoningEffort: ReasoningEffort
  maxOutputTokens: number
  monthlyBudgetUsd: number
  actionPointsPrompt: string | null
  keyLast4: string | null
  keySetAt: string | null
  keySetBy: string | null
}

export async function loadAiSettings(): Promise<AiSettings> {
  const { data } = await createAdminClient()
    .from("ai_settings")
    .select("action_points_enabled, include_names, model, reasoning_effort, max_output_tokens, monthly_budget_usd, action_points_prompt, key_last4, key_set_at, key_set_by")
    .eq("id", 1)
    .maybeSingle()
  return {
    actionPointsEnabled: data?.action_points_enabled ?? true,
    includeNames: data?.include_names ?? false,
    model: data?.model || process.env.OPENAI_MODEL || "gpt-6-luna",
    reasoningEffort: (data?.reasoning_effort as ReasoningEffort) ?? "low",
    maxOutputTokens: data?.max_output_tokens ?? 600,
    monthlyBudgetUsd: Number(data?.monthly_budget_usd ?? 10),
    actionPointsPrompt: data?.action_points_prompt ?? null,
    keyLast4: data?.key_last4 ?? null,
    keySetAt: data?.key_set_at ?? null,
    keySetBy: data?.key_set_by ?? null,
  }
}

/** The saved key, else the OPENAI_API_KEY env var (legacy), else null. */
export async function getApiKey(): Promise<{ key: string; source: "saved" | "env" } | null> {
  const { data } = await createAdminClient().rpc("hc_ai_get_key")
  if (typeof data === "string" && data) return { key: data, source: "saved" }
  const env = process.env.OPENAI_API_KEY
  return env ? { key: env, source: "env" } : null
}

export async function monthSpendUsd(now = new Date()): Promise<{ calls: number; costUsd: number }> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  const { data } = await createAdminClient()
    .from("ai_runs")
    .select("cost_usd, status")
    .gte("created_at", start)
  const rows = data ?? []
  return {
    calls: rows.filter((r) => r.status !== "skipped").length,
    costUsd: rows.reduce((sum, r) => sum + Number(r.cost_usd ?? 0), 0),
  }
}

async function logRun(run: {
  feature: string; reviewId?: string | null; model?: string | null; status: "ok" | "error" | "skipped"
  reason?: string | null; inputTokens?: number | null; outputTokens?: number | null; costUsd?: number | null
  triggeredBy?: string | null
}) {
  const { error } = await createAdminClient().from("ai_runs").insert({
    feature: run.feature,
    review_id: run.reviewId ?? null,
    model: run.model ?? null,
    status: run.status,
    reason: run.reason ?? null,
    input_tokens: run.inputTokens ?? null,
    output_tokens: run.outputTokens ?? null,
    cost_usd: run.costUsd ?? null,
    triggered_by: run.triggeredBy ?? null,
  })
  if (error) console.error("[ai] failed to log run", error)
}

// Reasoning-effort is only accepted by reasoning models.
function supportsReasoning(model: string) {
  return /^(gpt-5|gpt-6|o\d)/.test(model)
}

/** Stable, non-reversible id so OpenAI can trace abuse without personal data. */
function safetyIdentifier(employeeId: string | null | undefined) {
  if (!employeeId) return undefined
  return createHash("sha256").update(`hr-portal:${employeeId}`).digest("hex").slice(0, 32)
}

async function fetchWithRetry(url: string, init: RequestInit, attempts = 2, timeoutMs = 45_000): Promise<Response> {
  let last: Response | null = null
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      last = await fetch(url, { ...init, signal: ctrl.signal })
    } finally {
      clearTimeout(t)
    }
    if (last.status !== 429 && last.status < 500) return last
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)))
  }
  return last!
}

export type GenerateResult =
  | { ok: true; text: string; model: string; inputTokens: number; outputTokens: number; costUsd: number }
  | { ok: false; reason: string; message: string }

const FRIENDLY: Record<string, string> = {
  no_api_key: "No OpenAI API key is set. Add one in Settings → AI.",
  budget: "This month's AI spend cap has been reached. Raise it in Settings → AI.",
  timeout: "OpenAI took too long to respond. Try again.",
  empty: "OpenAI returned an empty answer. Try again.",
}

/** One text generation via the Responses API. Logs the run; never throws. */
export async function generateText(opts: {
  feature: string
  instructions: string
  input: string
  reviewId?: string | null
  triggeredBy?: string | null
  settings?: AiSettings
}): Promise<GenerateResult> {
  const settings = opts.settings ?? (await loadAiSettings())
  const model = settings.model
  const base = { feature: opts.feature, reviewId: opts.reviewId, model, triggeredBy: opts.triggeredBy }

  const key = await getApiKey()
  if (!key) {
    await logRun({ ...base, status: "skipped", reason: "no_api_key" })
    return { ok: false, reason: "no_api_key", message: FRIENDLY.no_api_key }
  }

  const { costUsd: spent } = await monthSpendUsd()
  if (settings.monthlyBudgetUsd > 0 && spent >= settings.monthlyBudgetUsd) {
    await logRun({ ...base, status: "skipped", reason: "budget" })
    return { ok: false, reason: "budget", message: FRIENDLY.budget }
  }

  const body: Record<string, unknown> = {
    model,
    instructions: opts.instructions,
    input: opts.input,
    max_output_tokens: settings.maxOutputTokens,
    store: false,
  }
  if (supportsReasoning(model)) body.reasoning = { effort: settings.reasoningEffort }
  const sid = safetyIdentifier(opts.triggeredBy)
  if (sid) body.safety_identifier = sid

  try {
    const res = await fetchWithRetry("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key.key}` },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => "")
      console.error("[ai] OpenAI error", res.status, detail.slice(0, 500))
      let msg = `OpenAI returned an error (${res.status}).`
      try { msg = JSON.parse(detail)?.error?.message ?? msg } catch {}
      await logRun({ ...base, status: "error", reason: `openai_${res.status}: ${msg}`.slice(0, 500) })
      return { ok: false, reason: `openai_${res.status}`, message: msg }
    }

    const json = await res.json()
    const text = extractText(json).trim()
    const inputTokens = Number(json?.usage?.input_tokens ?? 0)
    const outputTokens = Number(json?.usage?.output_tokens ?? 0)
    const costUsd = estimateCost(model, inputTokens, outputTokens)

    if (!text) {
      await logRun({ ...base, status: "error", reason: `empty (${json?.status ?? "unknown"})`, inputTokens, outputTokens, costUsd })
      return { ok: false, reason: "empty", message: FRIENDLY.empty }
    }
    await logRun({ ...base, status: "ok", inputTokens, outputTokens, costUsd })
    return { ok: true, text, model, inputTokens, outputTokens, costUsd }
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "AbortError"
    console.error("[ai] request failed", e)
    await logRun({ ...base, status: "error", reason: timedOut ? "timeout" : "network" })
    return { ok: false, reason: timedOut ? "timeout" : "network", message: timedOut ? FRIENDLY.timeout : "Couldn't reach OpenAI." }
  }
}

// Responses API output: [{ type: "message", content: [{ type: "output_text", text }] }, …]
function extractText(json: unknown): string {
  const j = json as { output_text?: string; output?: { type?: string; content?: { type?: string; text?: string }[] }[] }
  if (typeof j?.output_text === "string") return j.output_text
  return (j?.output ?? [])
    .filter((o) => o?.type === "message")
    .flatMap((o) => o.content ?? [])
    .filter((c) => c?.type === "output_text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("\n")
}

/** Check a key works and list the text models it can use. */
export async function listModels(key: string): Promise<{ ok: true; models: string[] } | { ok: false; message: string }> {
  try {
    const res = await fetchWithRetry("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    }, 1, 15_000)
    if (!res.ok) {
      const detail = await res.text().catch(() => "")
      let msg = res.status === 401 ? "OpenAI rejected this key." : `OpenAI returned an error (${res.status}).`
      try { msg = JSON.parse(detail)?.error?.message ?? msg } catch {}
      return { ok: false, message: msg }
    }
    const json = await res.json()
    const models = ((json?.data ?? []) as { id: string }[])
      .map((m) => m.id)
      .filter((id) => /^(gpt-|o\d)/.test(id) && !/(audio|realtime|transcribe|tts|image|search|embedding)/.test(id))
      .sort()
    return { ok: true, models }
  } catch {
    return { ok: false, message: "Couldn't reach OpenAI." }
  }
}
