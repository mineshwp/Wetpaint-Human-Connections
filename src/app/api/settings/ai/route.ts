import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireHR } from "@/lib/hr-api"
import { getApiKey, loadAiSettings, monthSpendUsd, type ReasoningEffort } from "@/lib/ai/openai"
import { DEFAULT_ACTION_POINTS_PROMPT } from "@/lib/ai/prompts"
import { RECOMMENDED_MODEL, priceFor } from "@/lib/ai/pricing"

// Settings → AI (HR only). The API key is never returned — only whether one is
// set, where it comes from, and its last 4 characters.

export async function GET() {
  const ctx = await requireHR()
  if (ctx.error) return ctx.error
  const admin = createAdminClient()

  const [settings, key, usage, { data: runs }, { data: reviews }] = await Promise.all([
    loadAiSettings(),
    getApiKey(),
    monthSpendUsd(),
    admin
      .from("ai_runs")
      .select("id, feature, model, status, reason, input_tokens, output_tokens, cost_usd, created_at, who:employees!ai_runs_triggered_by_fkey(first_name, last_name)")
      .order("created_at", { ascending: false })
      .limit(25),
    admin
      .from("kpi_reviews")
      .select("id, period, employee:employees!kpi_reviews_employee_id_fkey(first_name, last_name)")
      .in("status", ["active", "completed"])
      .eq("is_archived", false)
      .order("created_at", { ascending: false })
      .limit(100),
  ])

  let keySetByName: string | null = null
  if (settings.keySetBy) {
    const { data: e } = await admin.from("employees").select("first_name, last_name").eq("id", settings.keySetBy).maybeSingle()
    keySetByName = e ? `${e.first_name} ${e.last_name}`.trim() : null
  }

  type Person = { first_name: string; last_name: string } | null
  return NextResponse.json({
    settings: {
      actionPointsEnabled: settings.actionPointsEnabled,
      includeNames: settings.includeNames,
      model: settings.model,
      reasoningEffort: settings.reasoningEffort,
      maxOutputTokens: settings.maxOutputTokens,
      monthlyBudgetUsd: settings.monthlyBudgetUsd,
      actionPointsPrompt: settings.actionPointsPrompt,
    },
    key: {
      source: key?.source ?? "none",
      last4: key?.source === "saved" ? settings.keyLast4 : key?.source === "env" ? key.key.slice(-4) : null,
      setAt: key?.source === "saved" ? settings.keySetAt : null,
      setBy: key?.source === "saved" ? keySetByName : null,
    },
    defaults: { actionPointsPrompt: DEFAULT_ACTION_POINTS_PROMPT, model: RECOMMENDED_MODEL },
    modelPriceKnown: priceFor(settings.model).known,
    usage: { month: new Date().toISOString().slice(0, 7), calls: usage.calls, costUsd: usage.costUsd },
    runs: (runs ?? []).map((r) => {
      const who = r.who as unknown as Person
      return {
        id: r.id, feature: r.feature, model: r.model, status: r.status, reason: r.reason,
        inputTokens: r.input_tokens, outputTokens: r.output_tokens, costUsd: r.cost_usd == null ? null : Number(r.cost_usd),
        createdAt: r.created_at, by: who ? `${who.first_name} ${who.last_name}`.trim() : null,
      }
    }),
    previewReviews: (reviews ?? []).map((r) => {
      const e = r.employee as unknown as Person
      return { id: r.id, label: `${e ? `${e.first_name} ${e.last_name}` : "Staff member"} — ${r.period}` }
    }),
  })
}

const EFFORTS: ReasoningEffort[] = ["none", "low", "medium", "high"]

// Body: any of { actionPointsEnabled, includeNames, model, reasoningEffort,
// maxOutputTokens, monthlyBudgetUsd, actionPointsPrompt (null = default) }
export async function PUT(req: NextRequest) {
  const ctx = await requireHR({ write: true })
  if (ctx.error) return ctx.error
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid body" }, { status: 400 })

  const update: Record<string, unknown> = {}
  if (typeof body.actionPointsEnabled === "boolean") update.action_points_enabled = body.actionPointsEnabled
  if (typeof body.includeNames === "boolean") update.include_names = body.includeNames
  if (body.model !== undefined) {
    const m = typeof body.model === "string" ? body.model.trim() : ""
    if (!/^[a-z0-9][a-z0-9._:-]{1,80}$/i.test(m)) return NextResponse.json({ error: "Enter a valid model name" }, { status: 400 })
    update.model = m
  }
  if (body.reasoningEffort !== undefined) {
    if (!EFFORTS.includes(body.reasoningEffort)) return NextResponse.json({ error: "Invalid reasoning effort" }, { status: 400 })
    update.reasoning_effort = body.reasoningEffort
  }
  if (body.maxOutputTokens !== undefined) {
    const n = Math.round(Number(body.maxOutputTokens))
    if (!(n >= 100 && n <= 4000)) return NextResponse.json({ error: "Max answer length must be 100–4000 tokens" }, { status: 400 })
    update.max_output_tokens = n
  }
  if (body.monthlyBudgetUsd !== undefined) {
    const n = Number(body.monthlyBudgetUsd)
    if (!(n >= 0 && n <= 10000)) return NextResponse.json({ error: "Spend cap must be between $0 and $10,000" }, { status: 400 })
    update.monthly_budget_usd = Math.round(n * 100) / 100
  }
  if (body.actionPointsPrompt !== undefined) {
    const p = typeof body.actionPointsPrompt === "string" ? body.actionPointsPrompt.trim() : ""
    if (p.length > 8000) return NextResponse.json({ error: "Prompt is too long (8,000 characters max)" }, { status: 400 })
    update.action_points_prompt = p && p !== DEFAULT_ACTION_POINTS_PROMPT.trim() ? p : null
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 })

  update.updated_at = new Date().toISOString()
  update.updated_by = ctx.employeeId
  const { error } = await ctx.supabase.from("ai_settings").update(update).eq("id", 1)
  if (error) {
    console.error("[PUT /api/settings/ai]", error)
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
