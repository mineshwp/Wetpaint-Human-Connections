"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { AlertCircle, Bug, CheckCircle2, FileText, ImagePlus, Lightbulb, Link2, Loader2, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  ATTACHMENT_TYPES, MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES, MAX_DESCRIPTION, MAX_LINKS, MAX_TITLE,
  type FeedbackKind,
} from "@/lib/feedback"

interface Props {
  kind: FeedbackKind | null
  onClose: () => void
}

interface Pending {
  id: string
  file: File
  preview: string | null
}

const COPY: Record<FeedbackKind, {
  heading: string
  intro: string
  titleLabel: string
  titlePlaceholder: string
  descLabel: string
  descPlaceholder: string
  filesLabel: string
  success: string
}> = {
  problem: {
    heading: "Report an Issue",
    intro: "Something not working, or not looking right? Tell us what happened. A screenshot helps a lot.",
    titleLabel: "In a few words, what went wrong?",
    titlePlaceholder: "e.g. My score won't save",
    descLabel: "What happened?",
    descPlaceholder: "What were you trying to do? What did you expect to happen? What did you see instead, including any error message?",
    filesLabel: "Screenshots of what you see",
    success: "Thank you. Your report has been sent to HR, who will look into it.",
  },
  idea: {
    heading: "Share an Idea",
    intro: "Got an idea that would make the app better? Tell us about it. No idea is too small.",
    titleLabel: "What is your idea, in a few words?",
    titlePlaceholder: "e.g. Show a reminder before my review is due",
    descLabel: "Tell us more",
    descPlaceholder: "What would it do, and how would it help you or your team?",
    filesLabel: "Pictures for reference",
    success: "Thank you. Your idea has been sent to HR.",
  },
}

const inputClass = cn(
  "w-full rounded-lg border border-border bg-white px-3 text-sm text-foreground",
  "placeholder:text-muted-foreground outline-none transition-all",
  "focus:border-primary/50 focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
)

export function FeedbackDialog({ kind, onClose }: Props) {
  if (!kind) return null
  // Re-mount per open so the form always starts fresh.
  return <DialogBody key={kind} kind={kind} onClose={onClose} />
}

function DialogBody({ kind, onClose }: { kind: FeedbackKind; onClose: () => void }) {
  const copy = COPY[kind]
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [links, setLinks] = useState<string[]>([""])
  const [files, setFiles] = useState<Pending[]>([])
  const [dragging, setDragging] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const titleInput = useRef<HTMLInputElement>(null)
  const filesRef = useRef<Pending[]>([])
  useEffect(() => { filesRef.current = files }, [files])

  const addFiles = useCallback((incoming: File[]) => {
    const problems: string[] = []
    const accepted: Pending[] = []
    for (const file of incoming) {
      if (!ATTACHMENT_TYPES.includes(file.type)) {
        problems.push(`${file.name || "That file"} isn't an image or PDF`)
        continue
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        problems.push(`${file.name || "That file"} is over 10 MB`)
        continue
      }
      accepted.push({
        id: crypto.randomUUID(),
        file,
        preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      })
    }
    setFiles((cur) => {
      const room = MAX_ATTACHMENTS - cur.length
      if (accepted.length > room) problems.push(`You can attach up to ${MAX_ATTACHMENTS} files`)
      return [...cur, ...accepted.slice(0, Math.max(room, 0))]
    })
    setError(problems.length ? problems.join(". ") + "." : null)
  }, [])

  // Paste a screenshot straight from the clipboard (Ctrl/Cmd+V), anywhere in the dialog.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const pasted = Array.from(e.clipboardData?.files ?? [])
      if (pasted.length === 0) return
      e.preventDefault()
      addFiles(pasted.map((f, i) => (f.name && f.name !== "image.png" ? f : new File([f], `screenshot-${Date.now()}-${i + 1}.png`, { type: f.type }))))
    }
    document.addEventListener("paste", onPaste)
    return () => document.removeEventListener("paste", onPaste)
  }, [addFiles])

  useEffect(() => {
    titleInput.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !sending) onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose, sending])

  // Free the preview URLs when the dialog closes.
  useEffect(() => () => filesRef.current.forEach((f) => f.preview && URL.revokeObjectURL(f.preview)), [])

  function removeFile(id: string) {
    setFiles((cur) => {
      const gone = cur.find((f) => f.id === id)
      if (gone?.preview) URL.revokeObjectURL(gone.preview)
      return cur.filter((f) => f.id !== id)
    })
  }

  async function uploadOne(f: Pending): Promise<{ path: string; name: string }> {
    const start = await fetch("/api/feedback/upload-url", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: f.file.name, size: f.file.size, type: f.file.type }),
    })
    const s = await start.json().catch(() => null)
    if (!start.ok) throw new Error(`${f.file.name}: ${s?.error ?? "couldn't start the upload"}`)
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const { error: upErr } = await supabase.storage.from(s.bucket).uploadToSignedUrl(s.path, s.token, f.file, {
      contentType: f.file.type,
    })
    if (upErr) throw new Error(`${f.file.name}: upload failed (${upErr.message})`)
    return { path: s.path as string, name: f.file.name }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (sending) return
    if (!title.trim()) return setError("Please add a short title.")
    if (!description.trim()) return setError("Please describe it so we can understand.")
    setSending(true)
    setError(null)
    try {
      const attachments = []
      for (const f of files) attachments.push(await uploadOne(f))
      const res = await fetch("/api/feedback", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind, title, description,
          links: kind === "idea" ? links.filter((l) => l.trim()) : [],
          attachments,
          pageUrl: window.location.pathname,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json.error as string) ?? `Couldn't send (${res.status})`)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send. Check your connection and try again.")
    } finally {
      setSending(false)
    }
  }

  const Icon = kind === "problem" ? Bug : Lightbulb

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !sending) onClose() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="feedback-heading"
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-card shadow-xl sm:rounded-2xl">
        <div className="flex items-start gap-3 border-b border-border px-5 py-4">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="feedback-heading" className="text-base font-semibold text-foreground">{copy.heading}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{copy.intro}</p>
          </div>
          <button type="button" onClick={onClose} disabled={sending} aria-label="Close"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50">
            <X className="h-4 w-4" />
          </button>
        </div>

        {sent ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            <p className="text-sm text-foreground">{copy.success}</p>
            <Button type="button" size="lg" onClick={onClose}>Close</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div className="space-y-1.5">
                <label htmlFor="fb-title" className="text-xs font-semibold text-foreground">{copy.titleLabel}</label>
                <input id="fb-title" ref={titleInput} value={title} maxLength={MAX_TITLE} disabled={sending}
                  onChange={(e) => setTitle(e.target.value)} placeholder={copy.titlePlaceholder} className={cn(inputClass, "h-9")} />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="fb-desc" className="text-xs font-semibold text-foreground">{copy.descLabel}</label>
                <textarea id="fb-desc" value={description} maxLength={MAX_DESCRIPTION} rows={5} disabled={sending}
                  onChange={(e) => setDescription(e.target.value)} placeholder={copy.descPlaceholder}
                  className={cn(inputClass, "resize-y py-2")} />
              </div>

              {kind === "idea" && (
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-foreground">Reference links <span className="font-normal text-muted-foreground">(optional)</span></span>
                  {links.map((link, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <input value={link} disabled={sending} inputMode="url" aria-label={`Link ${i + 1}`}
                        onChange={(e) => setLinks((cur) => cur.map((l, j) => (j === i ? e.target.value : l)))}
                        placeholder="https://example.com/what-you-mean" className={cn(inputClass, "h-9")} />
                      {links.length > 1 && (
                        <button type="button" aria-label="Remove link" onClick={() => setLinks((cur) => cur.filter((_, j) => j !== i))}
                          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {links.length < MAX_LINKS && (
                    <button type="button" onClick={() => setLinks((cur) => [...cur, ""])} disabled={sending}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                      <Plus className="h-3.5 w-3.5" /> Add another link
                    </button>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-foreground">{copy.filesLabel} <span className="font-normal text-muted-foreground">(optional)</span></span>
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(Array.from(e.dataTransfer.files)) }}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors",
                    dragging ? "border-primary bg-primary/5" : "border-border bg-muted/30"
                  )}
                >
                  <ImagePlus className="h-5 w-5 text-muted-foreground" />
                  <p className="text-xs text-foreground">
                    <strong>Paste a screenshot</strong> (Ctrl+V on Windows, Cmd+V on Mac), drag files here, or{" "}
                    <button type="button" className="font-semibold text-primary hover:underline" disabled={sending}
                      onClick={() => fileInput.current?.click()}>choose files</button>
                  </p>
                  <p className="text-[11px] text-muted-foreground">Up to {MAX_ATTACHMENTS} files, 10 MB each. Images or PDF.</p>
                  <input ref={fileInput} type="file" multiple hidden accept={ATTACHMENT_TYPES.join(",")}
                    onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = "" }} />
                </div>
                {files.length > 0 && (
                  <ul className="grid grid-cols-3 gap-2 pt-1 sm:grid-cols-4">
                    {files.map((f) => (
                      <li key={f.id} className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted">
                        {f.preview ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={f.preview} alt={f.file.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full flex-col items-center justify-center gap-1 p-1 text-center">
                            <FileText className="h-5 w-5 text-muted-foreground" />
                            <span className="line-clamp-2 break-all text-[10px] text-muted-foreground">{f.file.name}</span>
                          </div>
                        )}
                        <button type="button" aria-label={`Remove ${f.file.name}`} disabled={sending} onClick={() => removeFile(f.id)}
                          className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80">
                          <X className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <p className="text-[11px] text-muted-foreground">
                We&rsquo;ll also include your name and the page you&rsquo;re on, so HR can follow up. Please don&rsquo;t
                include passwords in screenshots.
              </p>

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span>{error}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3">
              <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={sending}>Cancel</Button>
              <Button type="submit" size="lg" disabled={sending} className="gap-1.5">
                {sending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {sending ? "Sending…" : kind === "problem" ? "Send report" : "Send idea"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
