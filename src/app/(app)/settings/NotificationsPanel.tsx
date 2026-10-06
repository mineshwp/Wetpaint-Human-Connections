"use client"

import { useState } from "react"
import { Bell, Loader2, AlertCircle, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function NotificationsPanel({ initialEmails }: { initialEmails: string[] }) {
  const [value, setValue] = useState(initialEmails.join(", "))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch("/api/settings/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passwordResetEmails: value }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage({ type: "error", text: (json.error as string) ?? `Failed to save (${res.status})` })
        return
      }
      const saved = (json.passwordResetEmails as string[]) ?? []
      setValue(saved.join(", "))
      setMessage({
        type: "success",
        text: saved.length ? "Saved. Password requests will go to these addresses." : "Saved. Password requests will go to all HR admins.",
      })
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Network error — please try again." })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border bg-muted/30">
        <Bell className="h-4 w-4 text-primary shrink-0" />
        <div>
          <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Choose who is emailed when something needs HR&rsquo;s attention.</p>
        </div>
      </div>

      {message && (
        <div className={cn(
          "flex items-start gap-2.5 px-5 py-3 border-b text-sm",
          message.type === "error" ? "bg-red-50 border-red-200 text-red-700" : "bg-green-50 border-green-200 text-green-700"
        )}>
          {message.type === "error" ? <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> : <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />}
          <span>{message.text}</span>
        </div>
      )}

      <form onSubmit={save} className="px-5 py-4 space-y-2">
        <label htmlFor="pw-emails" className="text-xs font-semibold text-foreground">Password reset requests go to</label>
        <input
          id="pw-emails"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="ujala@wetpaint.co.za"
          disabled={saving}
          className={cn(
            "h-9 w-full rounded-lg border border-border bg-white px-3 text-sm text-foreground",
            "placeholder:text-muted-foreground outline-none transition-all",
            "focus:border-primary/50 focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          )}
        />
        <p className="text-xs text-muted-foreground">
          When staff or managers use &ldquo;Forgot password&rdquo;, this person is emailed to set them a temporary password.
          Separate several addresses with commas (up to 5). Leave it empty to email all HR admins.
        </p>
        <div className="pt-1">
          <Button type="submit" size="sm" disabled={saving} className="h-9 gap-1.5">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
        </div>
      </form>
    </section>
  )
}
