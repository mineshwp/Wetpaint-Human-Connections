"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, Megaphone, Sparkles, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { MAX_ANNOUNCEMENT_BODY, MAX_ANNOUNCEMENT_TITLE } from "@/lib/feedback"
import type { AnnouncementView } from "@/lib/announcements-server"

const fmt = new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "long", year: "numeric" })
const inputClass = "w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 disabled:opacity-50"

export function UpdatesClient({ initial, canPost, audienceCount }: { initial: AnnouncementView[]; canPost: boolean; audienceCount: number }) {
  const router = useRouter()
  const [items, setItems] = useState(initial)

  // Opening the page counts as reading everything. The "New" tags below keep
  // showing for this visit (they come from the server copy), then the badge clears.
  useEffect(() => {
    if (!initial.some((i) => !i.read)) return
    fetch("/api/announcements/read", { method: "POST" }).then(() => router.refresh()).catch(() => {})
  }, [initial, router])

  return (
    <div className="space-y-6">
      {canPost && <Composer audienceCount={audienceCount} onPosted={(a) => setItems((cur) => [a, ...cur])} />}

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <Sparkles className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Nothing new yet</p>
          <p className="text-xs text-muted-foreground">When a new feature is added, you&rsquo;ll see it here.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((a) => (
            <li key={a.id} className="rounded-xl border border-border bg-card px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
                    {a.title}
                    {!a.read && <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">New</span>}
                  </h3>
                  <p className="text-xs text-muted-foreground">{fmt.format(new Date(a.created_at))}{a.author_name && ` · ${a.author_name}`}</p>
                </div>
                {canPost && (
                  <button type="button" aria-label={`Delete ${a.title}`} onClick={async () => {
                    if (!window.confirm("Delete this announcement? Emails already sent can't be recalled.")) return
                    const res = await fetch(`/api/announcements/${a.id}`, { method: "DELETE" }).catch(() => null)
                    if (res?.ok) setItems((cur) => cur.filter((i) => i.id !== a.id))
                  }} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="mt-2 space-y-2 text-sm leading-relaxed text-foreground">
                {a.body.split(/\n{2,}/).map((p, i) => <p key={i} className="whitespace-pre-wrap">{p}</p>)}
              </div>
              {a.link_url && (
                <a href={a.link_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                  Learn more <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              {canPost && a.emailed_count > 0 && <p className="mt-2 text-[11px] text-muted-foreground">Also emailed to {a.emailed_count} people.</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Composer({ audienceCount, onPosted }: { audienceCount: number; onPosted: (a: AnnouncementView) => void }) {
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [link, setLink] = useState("")
  const [email, setEmail] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  async function post() {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch("/api/announcements", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, body, linkUrl: link, email }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json.error as string) ?? `Couldn't post (${res.status})`)
      onPosted(json.announcement as AnnouncementView)
      setMessage({ type: "success", text: email ? `Posted. Emailed ${json.emailed} of ${json.audience} people.` : "Posted. Everyone will see it in the app." })
      setTitle(""); setBody(""); setLink(""); setEmail(false)
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Couldn't post. Please try again." })
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  const ready = title.trim() && body.trim()
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2.5 border-b border-border bg-muted/30 px-5 py-3">
        <Megaphone className="h-4 w-4 text-primary" />
        <div>
          <h2 className="text-sm font-semibold text-foreground">Tell everyone about a new feature</h2>
          <p className="text-xs text-muted-foreground">Everyone sees it in the app: a banner at the top and here on this page.</p>
        </div>
      </div>
      <form className="space-y-3 px-5 py-4" onSubmit={(e) => { e.preventDefault(); if (ready) setConfirming(true) }}>
        <div className="space-y-1">
          <label htmlFor="ann-title" className="text-xs font-semibold text-foreground">Title</label>
          <input id="ann-title" value={title} maxLength={MAX_ANNOUNCEMENT_TITLE} disabled={busy} onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. New: Help guide and Report an Issue" className={cn(inputClass, "h-9")} />
        </div>
        <div className="space-y-1">
          <label htmlFor="ann-body" className="text-xs font-semibold text-foreground">Message</label>
          <textarea id="ann-body" rows={5} value={body} maxLength={MAX_ANNOUNCEMENT_BODY} disabled={busy} onChange={(e) => setBody(e.target.value)}
            placeholder="What's new, and how does it help? Leave a blank line between paragraphs." className={cn(inputClass, "resize-y py-2")} />
        </div>
        <div className="space-y-1">
          <label htmlFor="ann-link" className="text-xs font-semibold text-foreground">Link <span className="font-normal text-muted-foreground">(optional)</span></label>
          <input id="ann-link" value={link} disabled={busy} inputMode="url" onChange={(e) => setLink(e.target.value)}
            placeholder="https://… for more detail" className={cn(inputClass, "h-9")} />
        </div>
        <label className="flex items-start gap-2 text-sm text-foreground">
          <input type="checkbox" checked={email} disabled={busy} onChange={(e) => setEmail(e.target.checked)} className="mt-1" />
          <span>Also email it to everyone <span className="text-muted-foreground">({audienceCount} staff with a login)</span></span>
        </label>

        {message && (
          <div role="status" className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
            message.type === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700")}>
            {message.type === "error" ? <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />} <span>{message.text}</span>
          </div>
        )}

        {confirming ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
            <p className="flex-1 text-sm text-amber-900">
              {email ? `This goes to everyone in the app and emails ${audienceCount} people. It can't be unsent.` : "This goes to everyone in the app straight away."}
            </p>
            <Button type="button" size="sm" disabled={busy} onClick={post} className="gap-1">
              {busy && <Loader2 className="h-3 w-3 animate-spin" />} Yes, send it
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setConfirming(false)}>Go back</Button>
          </div>
        ) : (
          <Button type="submit" size="sm" disabled={!ready || busy} className="gap-1.5"><Megaphone className="h-3.5 w-3.5" /> Post update</Button>
        )}
      </form>
    </section>
  )
}
