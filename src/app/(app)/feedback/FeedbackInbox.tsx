"use client"

import { useMemo, useState } from "react"
import { Bug, ChevronDown, ExternalLink, FileText, Inbox, Lightbulb, Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { reportError } from "@/lib/report-error"
import { FEEDBACK_STATUSES, STATUS_ACTIONS, STATUS_LABELS, type FeedbackKind, type FeedbackStatus } from "@/lib/feedback"
import type { FeedbackItemView, FeedbackMessageView } from "@/lib/feedback-server"
import { Thread } from "@/components/feedback/Thread"

const STATUS_CLS: Record<FeedbackStatus, string> = {
  new: "bg-amber-50 text-amber-700 border-amber-200",
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
  done: "bg-emerald-50 text-emerald-700 border-emerald-200",
  closed: "bg-gray-50 text-gray-600 border-gray-200",
}

const fmt = new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })

export function FeedbackInbox({ initial }: { initial: FeedbackItemView[] }) {
  const [items, setItems] = useState(initial)
  const [kind, setKind] = useState<"all" | FeedbackKind>("all")
  const [status, setStatus] = useState<"open" | "reply" | "all" | FeedbackStatus>("open")
  const [openId, setOpenId] = useState<string | null>(null)

  const counts = useMemo(() => ({
    all: items.length,
    problem: items.filter((i) => i.kind === "problem").length,
    idea: items.filter((i) => i.kind === "idea").length,
    fresh: items.filter((i) => i.status === "new").length,
    awaiting: items.filter((i) => i.awaiting_hr).length,
  }), [items])

  const shown = items.filter((i) =>
    (kind === "all" || i.kind === kind) &&
    (status === "all" || (status === "reply" ? i.awaiting_hr : status === "open" ? i.status === "new" || i.status === "in_progress" : i.status === status)))

  function patchLocal(id: string, p: Partial<FeedbackItemView>) {
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...p } : i)))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {([
          ["all", `All (${counts.all})`],
          ["problem", `Problems (${counts.problem})`],
          ["idea", `Ideas (${counts.idea})`],
        ] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setKind(k)}
            className={cn("rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
              kind === k ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
            {label}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          Show
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}
            className="h-8 rounded-lg border border-border bg-white px-2 text-xs text-foreground">
            <option value="open">Needs attention ({counts.fresh} new)</option>
            <option value="reply">Waiting for your reply ({counts.awaiting})</option>
            <option value="all">Everything</option>
            {FEEDBACK_STATUSES.map((s) => <option key={s} value={s}>Only “{STATUS_LABELS.problem[s]}”</option>)}
          </select>
        </label>
      </div>

      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">{items.length === 0 ? "Nothing here yet" : "Nothing matches these filters"}</p>
          <p className="text-xs text-muted-foreground">
            {items.length === 0
              ? "When someone uses Report an Issue or Share an Idea, it will show up here."
              : "Try “Everything” to see closed items too."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {shown.map((item) => (
            <ItemCard key={item.id} item={item} open={openId === item.id}
              onToggle={() => setOpenId((cur) => (cur === item.id ? null : item.id))}
              onPatched={(p) => patchLocal(item.id, p)}
              onDeleted={() => { setItems((cur) => cur.filter((i) => i.id !== item.id)); setOpenId(null) }} />
          ))}
        </ul>
      )}
    </div>
  )
}

function ItemCard({ item, open, onToggle, onPatched, onDeleted }: {
  item: FeedbackItemView
  open: boolean
  onToggle: () => void
  onPatched: (p: Partial<FeedbackItemView>) => void
  onDeleted: () => void
}) {
  const addMessage = (m: FeedbackMessageView) =>
    onPatched({ messages: [...item.messages, m], ...(m.kind === "reply" && m.from_hr ? { awaiting_hr: false } : {}) })
  const [note, setNote] = useState(item.hr_note ?? "")
  const [busy, setBusy] = useState<"status" | "note" | "delete" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const Icon = item.kind === "problem" ? Bug : Lightbulb

  async function save(body: { status?: FeedbackStatus; hr_note?: string }, what: "status" | "note") {
    const before = item.messages
    setBusy(what)
    setError(null)
    try {
      const res = await fetch(`/api/feedback/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json.error as string) ?? `Couldn't save (${res.status})`)
      onPatched({
        status: json.item.status, hr_note: json.item.hr_note, updated_at: json.item.updated_at,
        ...(json.message ? { messages: [...before, json.message as FeedbackMessageView] } : {}),
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : "Couldn't save"
      setError(message)
      reportError({ message, route: `/api/feedback/${item.id}`, method: "PATCH", section: "Feedback" })
    } finally {
      setBusy(null)
    }
  }

  async function remove() {
    if (!window.confirm("Delete this item and its images? This can't be undone.")) return
    setBusy("delete")
    setError(null)
    const res = await fetch(`/api/feedback/${item.id}`, { method: "DELETE" }).catch(() => null)
    if (res?.ok) return onDeleted()
    const json = await res?.json().catch(() => ({}))
    setError((json?.error as string) ?? "Couldn't delete")
    setBusy(null)
  }

  return (
    <li className="overflow-hidden rounded-xl border border-border bg-card">
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/30">
        <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
          item.kind === "problem" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600")}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">{item.title}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {item.submitter_name ?? "Unknown"} · {fmt.format(new Date(item.created_at))}
            {item.attachments.length > 0 && ` · ${item.attachments.length} file${item.attachments.length === 1 ? "" : "s"}`}
          </span>
        </span>
        {item.awaiting_hr && (
          <span className="shrink-0 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">Replied</span>
        )}
        <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold", STATUS_CLS[item.status])}>
          {STATUS_LABELS[item.kind][item.status]}
        </span>
        <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-border px-4 py-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{item.description}</p>

          <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
            <div><dt className="inline text-muted-foreground">From: </dt><dd className="inline text-foreground">{item.submitter_name ?? "Unknown"}{item.submitter_email && ` (${item.submitter_email})`}</dd></div>
            {item.page_url && <div><dt className="inline text-muted-foreground">Page: </dt><dd className="inline font-mono text-foreground">{item.page_url}</dd></div>}
          </dl>

          {item.links.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-foreground">Reference links</p>
              <ul className="space-y-0.5">
                {item.links.map((l) => (
                  <li key={l}>
                    <a href={l} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all text-xs text-primary hover:underline">
                      {l} <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {item.attachments.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-foreground">Attachments</p>
              <ul className="flex flex-wrap gap-2">
                {item.attachments.map((a) => (
                  <li key={a.path}>
                    {a.url ? (
                      <a href={a.url} target="_blank" rel="noopener noreferrer" title={a.name}
                        className="block h-24 w-24 overflow-hidden rounded-lg border border-border bg-muted hover:ring-2 hover:ring-primary/30">
                        {a.mime?.startsWith("image/") ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full flex-col items-center justify-center gap-1 p-1 text-center">
                            <FileText className="h-5 w-5 text-muted-foreground" />
                            <span className="line-clamp-2 break-all text-[10px] text-muted-foreground">{a.name}</span>
                          </span>
                        )}
                      </a>
                    ) : <span className="text-xs text-muted-foreground">{a.name} (unavailable)</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-2 rounded-lg bg-muted/30 p-3">
            <p className="text-xs font-semibold text-foreground">
              Status: <span className="font-normal">{STATUS_LABELS[item.kind][item.status]}</span>
              <span className="font-normal text-muted-foreground"> · the person is emailed when you change it</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {STATUS_ACTIONS.map((a) => (
                <Button key={a.status} type="button" size="sm" variant={item.status === a.status ? "default" : "outline"}
                  disabled={busy !== null || item.status === a.status} onClick={() => save({ status: a.status }, "status")} className="gap-1">
                  {busy === "status" && item.status !== a.status && <Loader2 className="h-3 w-3 animate-spin" />} {a.label}
                </Button>
              ))}
              {item.status !== "new" && (
                <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => save({ status: "new" }, "status")}>Reopen</Button>
              )}
            </div>
          </div>

          <Thread itemId={item.id} kind={item.kind} messages={item.messages} viewer="hr" onAdded={addMessage} />

          <div className="space-y-1 rounded-lg bg-muted/30 p-3">
            <label htmlFor={`note-${item.id}`} className="text-xs font-semibold text-foreground">Internal note <span className="font-normal text-muted-foreground">(only HR sees this, never the person)</span></label>
            <textarea id={`note-${item.id}`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} disabled={busy !== null}
              className="w-full resize-y rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20" />
            <Button type="button" size="sm" variant="outline" disabled={busy !== null || note.trim() === (item.hr_note ?? "")}
              onClick={() => save({ hr_note: note }, "note")} className="gap-1">
              {busy === "note" && <Loader2 className="h-3 w-3 animate-spin" />} Save note
            </Button>
          </div>

          {error && <p className="text-xs text-red-600" role="alert">{error}</p>}

          <div className="flex justify-end">
            <button type="button" onClick={remove} disabled={busy !== null}
              className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline disabled:opacity-50">
              {busy === "delete" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />} Delete
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
