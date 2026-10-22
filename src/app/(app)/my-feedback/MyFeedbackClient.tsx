"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Bug, ChevronDown, ExternalLink, FileText, Lightbulb, MessageSquare } from "lucide-react"
import { cn } from "@/lib/utils"
import { STATUS_LABELS, type FeedbackStatus } from "@/lib/feedback"
import type { FeedbackItemView, FeedbackMessageView } from "@/lib/feedback-server"
import { Thread } from "@/components/feedback/Thread"

const STATUS_CLS: Record<FeedbackStatus, string> = {
  new: "bg-amber-50 text-amber-700 border-amber-200",
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
  done: "bg-emerald-50 text-emerald-700 border-emerald-200",
  closed: "bg-gray-50 text-gray-600 border-gray-200",
}
const fmt = new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", year: "numeric" })

function open(kind: "problem" | "idea") {
  window.dispatchEvent(new CustomEvent("hc:open-feedback", { detail: kind }))
}

export function MyFeedbackClient({ initial }: { initial: FeedbackItemView[] }) {
  const router = useRouter()
  const [items, setItems] = useState(initial)
  const [openId, setOpenId] = useState<string | null>(null)

  function toggle(item: FeedbackItemView) {
    const opening = openId !== item.id
    setOpenId(opening ? item.id : null)
    if (opening && item.unread) {
      // Clear the "new reply" badge, then refresh the sidebar count.
      setItems((cur) => cur.map((i) => (i.id === item.id ? { ...i, unread: false } : i)))
      fetch(`/api/feedback/${item.id}/read`, { method: "POST" }).then(() => router.refresh()).catch(() => {})
    }
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
        <MessageSquare className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">You haven&rsquo;t sent anything yet</p>
        <p className="max-w-sm text-xs text-muted-foreground">Something not working, or an idea to make the app better? Tell HR, and their reply will show up here.</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => open("problem")} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted"><Bug className="h-4 w-4" /> Report an Issue</button>
          <button type="button" onClick={() => open("idea")} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted"><Lightbulb className="h-4 w-4" /> Share an Idea</button>
        </div>
      </div>
    )
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const isOpen = openId === item.id
        const Icon = item.kind === "problem" ? Bug : Lightbulb
        const replies = item.messages.filter((m) => m.kind === "reply" && m.from_hr).length
        return (
          <li key={item.id} className="overflow-hidden rounded-xl border border-border bg-card">
            <button type="button" onClick={() => toggle(item)} aria-expanded={isOpen} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/30">
              <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", item.kind === "problem" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600")}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">{item.title}</span>
                  {item.unread && <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">New</span>}
                </span>
                <span className="block text-xs text-muted-foreground">
                  Sent {fmt.format(new Date(item.created_at))}{replies > 0 && ` · ${replies} repl${replies === 1 ? "y" : "ies"} from HR`}
                </span>
              </span>
              <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold", STATUS_CLS[item.status])}>{STATUS_LABELS[item.kind][item.status]}</span>
              <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
            </button>

            {isOpen && (
              <div className="space-y-4 border-t border-border px-4 py-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{item.description}</p>
                {item.links.length > 0 && (
                  <ul className="space-y-0.5">
                    {item.links.map((l) => (
                      <li key={l}><a href={l} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all text-xs text-primary hover:underline">{l} <ExternalLink className="h-3 w-3 shrink-0" /></a></li>
                    ))}
                  </ul>
                )}
                {item.attachments.length > 0 && (
                  <ul className="flex flex-wrap gap-2">
                    {item.attachments.map((a) => (
                      <li key={a.path}>
                        {a.url ? (
                          <a href={a.url} target="_blank" rel="noopener noreferrer" title={a.name} className="block h-20 w-20 overflow-hidden rounded-lg border border-border bg-muted">
                            {a.mime?.startsWith("image/") ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
                            ) : (
                              <span className="flex h-full flex-col items-center justify-center gap-1 p-1 text-center"><FileText className="h-5 w-5 text-muted-foreground" /><span className="line-clamp-2 break-all text-[10px] text-muted-foreground">{a.name}</span></span>
                            )}
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
                <Thread itemId={item.id} kind={item.kind} messages={item.messages} viewer="person"
                  onAdded={(m: FeedbackMessageView) => setItems((cur) => cur.map((i) => (i.id === item.id ? { ...i, messages: [...i.messages, m] } : i)))} />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
