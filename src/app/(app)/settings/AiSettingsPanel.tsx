"use client"

import { useCallback, useEffect, useState } from "react"
import { Check, KeyRound, Loader2, PlugZap, RotateCcw, Sparkles, Trash2, Wallet } from "lucide-react"
import { cn } from "@/lib/utils"

type Effort = "none" | "low" | "medium" | "high"
type Data = {
  settings: {
    actionPointsEnabled: boolean; includeNames: boolean; model: string; reasoningEffort: Effort
    maxOutputTokens: number; monthlyBudgetUsd: number; actionPointsPrompt: string | null
  }
  key: { source: "saved" | "env" | "none"; last4: string | null; setAt: string | null; setBy: string | null }
  defaults: { actionPointsPrompt: string; model: string }
  modelPriceKnown: boolean
  usage: { month: string; calls: number; costUsd: number }
  runs: { id: string; feature: string; model: string | null; status: string; reason: string | null; inputTokens: number | null; outputTokens: number | null; costUsd: number | null; createdAt: string; by: string | null }[]
  previewReviews: { id: string; label: string }[]
}

const FEATURE_LABEL: Record<string, string> = {
  action_points: "Action points",
  action_points_preview: "Prompt test",
}
const usd = (n: number) => (n < 0.01 && n > 0 ? "< $0.01" : `$${n.toFixed(2)}`)
const fmt = (d: string) => new Date(d).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })

function Card({ icon: Icon, title, subtitle, children }: { icon: React.ElementType; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card">
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2"><Icon size={17} className="text-primary" /><h2 className="font-bold text-base">{title}</h2></div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{subtitle}</p>}
      </div>
      <div className="px-5 py-4 space-y-3">{children}</div>
    </section>
  )
}

function Msg({ ok, text }: { ok: boolean; text: string | null }) {
  if (!text) return null
  return <p className={cn("text-xs", ok ? "text-emerald-700" : "text-destructive")}>{text}</p>
}

// Settings → AI (HR only). The API key is write-only from here.
export function AiSettingsPanel() {
  const [d, setD] = useState<Data | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)

  // key
  const [newKey, setNewKey] = useState("")
  const [keyBusy, setKeyBusy] = useState<null | "save" | "test" | "remove">(null)
  const [keyMsg, setKeyMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [models, setModels] = useState<string[]>([])

  // settings form
  const [form, setForm] = useState<Data["settings"] | null>(null)
  const [prompt, setPrompt] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // preview
  const [previewId, setPreviewId] = useState("")
  const [previewBusy, setPreviewBusy] = useState(false)
  const [preview, setPreview] = useState<{ text: string; model: string; costUsd: number } | null>(null)
  const [previewErr, setPreviewErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch("/api/settings/ai")
    const data = await res.json().catch(() => null)
    if (!res.ok) { setLoadErr(data?.error ?? "Failed to load AI settings"); return }
    setD(data)
    setForm(data.settings)
    setPrompt(data.settings.actionPointsPrompt ?? data.defaults.actionPointsPrompt)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  async function saveKey() {
    setKeyBusy("save"); setKeyMsg(null)
    const res = await fetch("/api/settings/ai/key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: newKey }) })
    const data = await res.json().catch(() => null)
    setKeyBusy(null)
    if (!res.ok) { setKeyMsg({ ok: false, text: data?.error ?? "Failed to save key" }); return }
    setNewKey("")
    setModels(data.models ?? [])
    setKeyMsg({ ok: true, text: `Key saved and working (ends ${data.last4}).` })
    await load()
  }

  async function testKey() {
    setKeyBusy("test"); setKeyMsg(null)
    const res = await fetch("/api/settings/ai/test", { method: "POST" })
    const data = await res.json().catch(() => null)
    setKeyBusy(null)
    if (!res.ok) { setKeyMsg({ ok: false, text: data?.error ?? "Test failed" }); return }
    setModels(data.models ?? [])
    setKeyMsg({ ok: true, text: `Connected. ${data.models?.length ?? 0} text models available.` })
  }

  async function removeKey() {
    if (!window.confirm("Remove the saved OpenAI key? AI features stop until a new key is added.")) return
    setKeyBusy("remove"); setKeyMsg(null)
    const res = await fetch("/api/settings/ai/key", { method: "DELETE" })
    setKeyBusy(null)
    if (!res.ok) { setKeyMsg({ ok: false, text: "Failed to remove key" }); return }
    setKeyMsg({ ok: true, text: "Key removed." })
    await load()
  }

  async function saveSettings() {
    if (!form || !d) return
    setSaving(true); setSaveMsg(null)
    const res = await fetch("/api/settings/ai", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, actionPointsPrompt: prompt }),
    })
    const data = await res.json().catch(() => null)
    setSaving(false)
    if (!res.ok) { setSaveMsg({ ok: false, text: data?.error ?? "Failed to save" }); return }
    setSaveMsg({ ok: true, text: "Settings saved." })
    await load()
  }

  async function runPreview() {
    setPreviewBusy(true); setPreviewErr(null); setPreview(null)
    const res = await fetch("/api/settings/ai/preview", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ review_id: previewId, prompt }),
    })
    const data = await res.json().catch(() => null)
    setPreviewBusy(false)
    if (!res.ok) { setPreviewErr(data?.error ?? "Preview failed"); return }
    setPreview(data)
    await load()
  }

  if (loadErr) return <p className="text-sm text-destructive">{loadErr}</p>
  if (!d || !form) return <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>

  const set = <K extends keyof Data["settings"]>(k: K, v: Data["settings"][K]) => setForm({ ...form, [k]: v })
  const budget = d.settings.monthlyBudgetUsd
  const pct = budget > 0 ? Math.min(100, (d.usage.costUsd / budget) * 100) : 0
  const promptIsDefault = prompt.trim() === d.defaults.actionPointsPrompt.trim()
  const modelOptions = Array.from(new Set([form.model, d.defaults.model, ...models])).filter(Boolean)
  const dirty = JSON.stringify(form) !== JSON.stringify(d.settings) || prompt.trim() !== (d.settings.actionPointsPrompt ?? d.defaults.actionPointsPrompt).trim()

  return (
    <div className="space-y-5">
      <Card icon={KeyRound} title="OpenAI connection"
        subtitle="Create a project key in OpenAI with access restricted to models and responses, and set a monthly spend limit there too. The key is stored encrypted and is never shown again after saving.">
        <div className="text-sm">
          {d.key.source === "saved" && <>Key saved, ending <span className="font-mono">…{d.key.last4}</span>{d.key.setBy ? ` · added by ${d.key.setBy}` : ""}{d.key.setAt ? ` · ${fmt(d.key.setAt)}` : ""}</>}
          {d.key.source === "env" && <>Using the key from the server&apos;s environment (ending <span className="font-mono">…{d.key.last4}</span>). Save a key here to manage it from Settings.</>}
          {d.key.source === "none" && <span className="text-muted-foreground">No key yet — AI features are off until one is added.</span>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="password" value={newKey} onChange={(e) => setNewKey(e.target.value)} autoComplete="off" spellCheck={false}
            placeholder={d.key.source === "none" ? "Paste your OpenAI API key (sk-…)" : "Paste a new key to replace it"}
            className="flex-1 min-w-[220px] h-9 rounded-lg border border-border bg-card px-3 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
          <button type="button" onClick={saveKey} disabled={!!keyBusy || !newKey.trim()}
            className="h-9 inline-flex items-center gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
            {keyBusy === "save" ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} {d.key.source === "saved" ? "Replace key" : "Save key"}
          </button>
          <button type="button" onClick={testKey} disabled={!!keyBusy || d.key.source === "none"}
            className="h-9 inline-flex items-center gap-1 rounded-lg border border-border px-3 text-xs hover:bg-muted disabled:opacity-40">
            {keyBusy === "test" ? <Loader2 size={12} className="animate-spin" /> : <PlugZap size={12} />} Test connection
          </button>
          {d.key.source === "saved" && (
            <button type="button" onClick={removeKey} disabled={!!keyBusy}
              className="h-9 inline-flex items-center gap-1 rounded-lg border border-destructive/30 px-3 text-xs text-destructive hover:bg-destructive/5 disabled:opacity-40">
              {keyBusy === "remove" ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Remove
            </button>
          )}
        </div>
        <Msg ok={!!keyMsg?.ok} text={keyMsg?.text ?? null} />
      </Card>

      <Card icon={Sparkles} title="Action points"
        subtitle="When HR publishes a KPI review, the AI drafts action points from the scores and comments. HR edits and approves them on the review — staff see nothing until then.">
        <label className="flex items-start gap-2.5 text-sm cursor-pointer">
          <input type="checkbox" checked={form.actionPointsEnabled} onChange={(e) => set("actionPointsEnabled", e.target.checked)} className="mt-0.5" />
          <span>Draft action points automatically when a review is published</span>
        </label>
        <label className="flex items-start gap-2.5 text-sm cursor-pointer">
          <input type="checkbox" checked={form.includeNames} onChange={(e) => set("includeNames", e.target.checked)} className="mt-0.5" />
          <span>
            Include staff names
            <span className="block text-xs text-muted-foreground">Off: OpenAI sees &ldquo;the staff member&rdquo;, their job title, scores and comments — never names, ID numbers, contact or banking details.</span>
          </span>
        </label>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="ai-prompt" className="text-sm font-semibold">Instructions (prompt)</label>
            <button type="button" onClick={() => setPrompt(d.defaults.actionPointsPrompt)} disabled={promptIsDefault}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40">
              <RotateCcw size={12} /> Reset to default
            </button>
          </div>
          <textarea id="ai-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={12} maxLength={8000}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm leading-relaxed font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
          <p className="text-[11px] text-muted-foreground">The review data (scores and reviewer comments) is added after these instructions automatically.</p>
        </div>

        <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
          <p className="text-sm font-semibold">Try it on a review</p>
          <p className="text-xs text-muted-foreground">Runs the prompt above (even unsaved) on a published review. Nothing is saved or shown to staff; it counts toward the spend cap.</p>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={previewId} onChange={(e) => setPreviewId(e.target.value)} aria-label="Review"
              className="flex-1 min-w-[220px] h-9 rounded-lg border border-border bg-card px-2 text-sm">
              <option value="">Pick a published review…</option>
              {d.previewReviews.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <button type="button" onClick={runPreview} disabled={previewBusy || !previewId || d.key.source === "none"}
              className="h-9 inline-flex items-center gap-1 rounded-lg border border-border px-3 text-xs hover:bg-muted disabled:opacity-40">
              {previewBusy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Try it
            </button>
          </div>
          {previewErr && <p className="text-xs text-destructive">{previewErr}</p>}
          {preview && (
            <div className="rounded-md border border-border bg-card p-3">
              <pre className="whitespace-pre-wrap text-sm font-sans">{preview.text}</pre>
              <p className="text-[11px] text-muted-foreground mt-2">{preview.model} · about {usd(preview.costUsd)}</p>
            </div>
          )}
        </div>
      </Card>

      <Card icon={PlugZap} title="Model and limits">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm space-y-1">
            <span className="font-semibold">Model</span>
            <select value={form.model} onChange={(e) => set("model", e.target.value)}
              className="w-full h-9 rounded-lg border border-border bg-card px-2 text-sm">
              {modelOptions.map((m) => <option key={m} value={m}>{m}{m === d.defaults.model ? " (recommended)" : ""}</option>)}
            </select>
            <span className="block text-[11px] text-muted-foreground">
              {models.length ? "Models your key can use." : "Test the connection to list every model your key can use."}
              {!d.modelPriceKnown && " Cost for this model is estimated at the highest rate."}
            </span>
          </label>
          <label className="text-sm space-y-1">
            <span className="font-semibold">Reasoning effort</span>
            <select value={form.reasoningEffort} onChange={(e) => set("reasoningEffort", e.target.value as Effort)}
              className="w-full h-9 rounded-lg border border-border bg-card px-2 text-sm">
              <option value="none">None — fastest</option>
              <option value="low">Low (recommended)</option>
              <option value="medium">Medium</option>
              <option value="high">High — slowest, costs more</option>
            </select>
            <span className="block text-[11px] text-muted-foreground">Ignored by older models.</span>
          </label>
          <label className="text-sm space-y-1">
            <span className="font-semibold">Max answer length (tokens)</span>
            <input type="number" min={100} max={4000} step={50} value={form.maxOutputTokens}
              onChange={(e) => set("maxOutputTokens", Number(e.target.value))}
              className="w-full h-9 rounded-lg border border-border bg-card px-3 text-sm" />
            <span className="block text-[11px] text-muted-foreground">About 0.75 words per token. 600 fits 3–6 action points.</span>
          </label>
          <label className="text-sm space-y-1">
            <span className="font-semibold">Monthly spend cap (USD)</span>
            <input type="number" min={0} max={10000} step={1} value={form.monthlyBudgetUsd}
              onChange={(e) => set("monthlyBudgetUsd", Number(e.target.value))}
              className="w-full h-9 rounded-lg border border-border bg-card px-3 text-sm" />
            <span className="block text-[11px] text-muted-foreground">AI calls stop once this month&apos;s estimated spend reaches it. 0 = no cap.</span>
          </label>
        </div>
      </Card>

      <div className="flex items-center gap-3 sticky bottom-0 bg-background/90 backdrop-blur py-3">
        <button type="button" onClick={saveSettings} disabled={saving || !dirty}
          className="h-9 inline-flex items-center gap-1 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save settings
        </button>
        {dirty && !saving && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
        <Msg ok={!!saveMsg?.ok} text={saveMsg?.text ?? null} />
      </div>

      <Card icon={Wallet} title="Usage this month"
        subtitle="Estimated from OpenAI's published prices. OpenAI's usage dashboard is the exact figure.">
        <div className="flex items-end gap-6 flex-wrap">
          <div><div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Calls</div><div className="text-2xl font-bold">{d.usage.calls}</div></div>
          <div><div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Estimated spend</div><div className="text-2xl font-bold">{usd(d.usage.costUsd)}</div></div>
          <div className="flex-1 min-w-[180px]">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{budget > 0 ? `Cap ${usd(budget)}` : "No cap"}</div>
            {budget > 0 && (
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className={cn("h-full rounded-full", pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${pct}%` }} />
              </div>
            )}
          </div>
        </div>
        {d.runs.length > 0 && (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="text-left font-semibold px-5 py-1.5">When</th>
                  <th className="text-left font-semibold px-2 py-1.5">What</th>
                  <th className="text-left font-semibold px-2 py-1.5">By</th>
                  <th className="text-left font-semibold px-2 py-1.5">Result</th>
                  <th className="text-right font-semibold px-5 py-1.5">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {d.runs.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-1.5 whitespace-nowrap">{fmt(r.createdAt)}</td>
                    <td className="px-2 py-1.5">{FEATURE_LABEL[r.feature] ?? r.feature}</td>
                    <td className="px-2 py-1.5">{r.by ?? "—"}</td>
                    <td className={cn("px-2 py-1.5", r.status === "ok" ? "text-emerald-700" : r.status === "error" ? "text-destructive" : "text-muted-foreground")}>
                      {r.status === "ok" ? "OK" : r.status === "skipped" ? `Skipped (${r.reason === "budget" ? "spend cap" : r.reason === "no_api_key" ? "no key" : r.reason})` : `Error: ${r.reason ?? ""}`}
                    </td>
                    <td className="px-5 py-1.5 text-right whitespace-nowrap">{r.costUsd != null ? usd(r.costUsd) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
