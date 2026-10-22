"use client"

import { useState } from "react"
import { Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { MAX_MESSAGE, STATUS_LABELS, type FeedbackKind, type FeedbackStatus } from "@/lib/feedback"
import type { FeedbackMessageView } from "@/lib/feedback-server"

const fmt = new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

/**
 * The conversation on a problem report or idea, plus a reply box.
 * `viewer` decides which side is "you": HR sees HR's messages on the right,
 * the person sees their own on the right.
 */
export function Thread({ itemId, kind, messages, viewer, onAdded }: {
  itemId: string
  kind: FeedbackKind
  messages: FeedbackMessageView[]
  viewer: "hr" | "person"
  onAdded: (m: FeedbackMessageView) => void
}) {
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/feedback/${itemId}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: text }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json.error as string) ?? `Couldn't send (${res.status})`)
      onAdded(json.message as FeedbackMessageView)
      setText("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send. Check your connection and try again.")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-3">
      {messages.length > 0 && (
        <ul className="space-y-2" aria-label="Conversation">
          {messages.map((m) => {
            if (m.kind === "status") {
              return (
                <li key={m.id} className="text-center text-[11px] text-muted-foreground">
                  {m.author_name ?? "HR"} marked this <strong className="text-foreground">{STATUS_LABELS[kind][m.body as FeedbackStatus] ?? m.body}</strong> · {fmt.format(new Date(m.created_at))}
                </li>
              )
            }
            const mine = viewer === "hr" ? m.from_hr : !m.from_hr
            return (
              <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2 text-sm",
                  mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted text-foreground")}>
                  <p className={cn("mb-0.5 text-[11px] font-semibold", mine ? "text-primary-foreground/80" : "text-muted-foreground")}>
                    {m.from_hr ? `${m.author_name ?? "HR"} (HR)` : m.author_name ?? "Staff member"} · {fmt.format(new Date(m.created_at))}
                  </p>
                  <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <form onSubmit={send} className="space-y-2">
        <label htmlFor={`reply-${itemId}`} className="text-xs font-semibold text-foreground">
          {viewer === "hr" ? "Reply to the person" : "Reply to HR"}
        </label>
        <textarea id={`reply-${itemId}`} rows={2} value={text} maxLength={MAX_MESSAGE} disabled={sending}
          onChange={(e) => setText(e.target.value)}
          placeholder={viewer === "hr" ? "They'll get an email and see this under My Feedback." : "Add more detail or answer a question."}
          className="w-full resize-y rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20" />
        {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
        <Button type="submit" size="sm" disabled={sending || !text.trim()} className="gap-1.5">
          {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Send reply
        </Button>
      </form>
    </div>
  )
}
