"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronDown, Check, Eye, EyeOff, ListChecks, Loader2, RotateCcw, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

type State = {
  reviewStatus: string
  approved: string | null
  approvedAt: string | null
  approvedBy: string | null
  draft: { content: string; source: "ai" | "hr"; model: string | null; generatedAt: string | null; updatedAt: string } | null
}

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" }) : ""

// HR's view of a review's action points: edit the AI draft (or write your own),
// approve it so staff can see it, regenerate, or take it back off staff view.
export function ActionPointsEditor({ reviewId, reviewStatus, onApprovedChange }: {
  reviewId: string
  reviewStatus: string
  onApprovedChange?: (approved: string | null) => void
}) {
  const [open, setOpen] = useState(true)
  const [s, setS] = useState<State | null>(null)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState<null | "save" | "approve" | "regen" | "unpublish" | "auto">(null)
  const autoTried = useRef(false)
  const [err, setErr] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const apply = useCallback((next: State) => {
    setS(next)
    setText(next.draft?.content ?? next.approved ?? "")
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const res = await fetch(`/api/kpi/reviews/${reviewId}/action-points`)
      const d: State | null = res.ok ? await res.json() : null
      if (cancelled || !d) return
      apply(d)
      // A completed review with nothing yet gets its AI draft now (covers
      // reviews completed before auto-drafting, or a draft that failed).
      // Staff still see nothing until HR approves.
      if (d.reviewStatus !== "completed" || d.draft || d.approved || autoTried.current) return
      autoTried.current = true
      setBusy("auto")
      const r = await fetch(`/api/kpi/reviews/${reviewId}/action-points`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ auto: true }),
      })
      const out = await r.json().catch(() => null)
      setBusy(null)
      if (cancelled) return
      if (!r.ok) { setErr(`Couldn't draft action points automatically: ${out?.error ?? "unknown error"}`); return }
      apply(out)
      if (out?.draft && !out.skipped) setNote("AI draft ready — check it, edit anything, then approve.")
    }
    load().catch(() => { if (!cancelled) setErr("Couldn't load action points") })
    return () => { cancelled = true }
  }, [reviewId, reviewStatus, apply])

  async function call(kind: NonNullable<typeof busy>) {
    setBusy(kind); setErr(null); setNote(null)
    const method = kind === "regen" ? "POST" : kind === "unpublish" ? "DELETE" : "PUT"
    const res = await fetch(`/api/kpi/reviews/${reviewId}/action-points`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "PUT" ? JSON.stringify({ content: text, approve: kind === "approve" }) : undefined,
    })
    const data = await res.json().catch(() => null)
    setBusy(null)
    if (!res.ok) { setErr(data?.error ?? "Something went wrong"); return }
    apply(data)
    onApprovedChange?.(data.approved ?? null)
    setNote(kind === "approve" ? "Approved — staff can now see these." : kind === "unpublish" ? "Hidden from staff; kept as a draft." : kind === "regen" ? "New AI draft ready to review." : "Draft saved.")
  }

  const published = reviewStatus === "active" || reviewStatus === "completed"
  const hasDraft = !!s?.draft
  const dirty = s ? text.trim() !== (s.draft?.content ?? s.approved ?? "").trim() : false
  const status = !s ? null
    : hasDraft ? { label: s.draft!.source === "ai" ? "AI draft — waiting for your approval" : "Draft — not yet visible to staff", cls: "bg-amber-50 text-amber-700 border-amber-200" }
    : s.approved ? { label: "Approved — visible to staff", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" }
    : { label: "None yet", cls: "bg-muted text-muted-foreground border-border" }

  return (
    <div className="rounded-xl border bg-card overflow-hidden shadow-sm border-border">
      <div role="button" tabIndex={0} onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((o) => !o) } }}
        className={cn("w-full flex items-center gap-3 px-5 py-4 text-left cursor-pointer select-none", open ? "border-b border-border" : "hover:bg-muted/20")}>
        <ListChecks size={18} className="shrink-0 text-primary" />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-[14px] leading-snug">Action Points</p>
          <p className="text-xs text-muted-foreground mt-0.5">Staff only see these after you approve them.</p>
        </div>
        {status && <span className={cn("hidden sm:inline text-[11px] font-medium rounded-full border px-2 py-0.5 shrink-0", status.cls)}>{status.label}</span>}
        <div className={cn("w-7 h-7 rounded-full border border-border flex items-center justify-center text-muted-foreground transition-transform shrink-0", !open && "-rotate-90")}>
          <ChevronDown size={14} />
        </div>
      </div>

      {open && (
        <div className="bg-[#FAFBFC] p-5 space-y-3">
          {!s && !err && <Loader2 size={16} className="animate-spin text-muted-foreground" />}
          {s && (
            <>
              {hasDraft && s.draft!.source === "ai" && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Sparkles size={12} className="text-primary" />
                  Drafted by AI{s.draft!.model ? ` (${s.draft!.model})` : ""} {fmt(s.draft!.generatedAt)}. Check it and edit anything before approving.
                </p>
              )}
              {s.approved && (
                <p className="text-xs text-muted-foreground">
                  {hasDraft ? "Staff currently see the previously approved version. " : ""}
                  Approved{s.approvedBy ? ` by ${s.approvedBy}` : ""} {fmt(s.approvedAt)}.
                </p>
              )}
              {busy === "auto" && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin text-primary" /> Drafting action points with AI…
                </p>
              )}
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} maxLength={5000}
                placeholder={published ? "Write action points, one per line starting with \"- \", or ask the AI for a draft." : "Publish the review first. The AI drafts action points when you mark it Complete."}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary" />
              <div className="flex items-center gap-2 flex-wrap">
                <button type="button" onClick={() => call("approve")} disabled={!!busy || !published || !text.trim() || (!dirty && !hasDraft && !!s.approved)}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
                  {busy === "approve" ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Approve &amp; show to staff
                </button>
                <button type="button" onClick={() => call("save")} disabled={!!busy || !dirty || !text.trim()}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-40">
                  {busy === "save" && <Loader2 size={12} className="animate-spin" />} Save draft
                </button>
                <button type="button" disabled={!!busy || !published}
                  onClick={() => { if (!dirty || window.confirm("Replace your unsaved edits with a new AI draft?")) call("regen") }}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-40">
                  {busy === "regen" ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} {hasDraft || s.approved ? "Regenerate with AI" : "Draft with AI"}
                </button>
                {s.approved && (
                  <button type="button" disabled={!!busy}
                    onClick={() => { if (window.confirm("Hide these action points from staff? They'll be kept as a draft.")) call("unpublish") }}
                    className="inline-flex items-center gap-1 rounded-md border border-destructive/30 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/5 disabled:opacity-40">
                    {busy === "unpublish" ? <Loader2 size={12} className="animate-spin" /> : <EyeOff size={12} />} Hide from staff
                  </button>
                )}
                {s.approved && !hasDraft && !dirty && (
                  <span className="text-[11px] text-emerald-700 flex items-center gap-1"><Eye size={12} /> Staff can see this</span>
                )}
              </div>
            </>
          )}
          {note && <p className="text-xs text-emerald-700">{note}</p>}
          {err && <p className="text-xs text-destructive">{err}</p>}
        </div>
      )}
    </div>
  )
}
