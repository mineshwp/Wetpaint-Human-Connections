"use client"

import { useState } from "react"
import { Bell, Loader2, AlertCircle, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface Props {
  initial: { passwordReset: string[]; staffChanges: string[] }
}

const inputClass = cn(
  "h-9 w-full rounded-lg border border-border bg-white px-3 text-sm text-foreground",
  "placeholder:text-muted-foreground outline-none transition-all",
  "focus:border-primary/50 focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
)

export function NotificationsPanel({ initial }: Props) {
  const [passwordReset, setPasswordReset] = useState(initial.passwordReset.join(", "))
  const [staffChanges, setStaffChanges] = useState(initial.staffChanges.join(", "))
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
        body: JSON.stringify({ passwordResetEmails: passwordReset, staffChangesEmails: staffChanges }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage({ type: "error", text: (json.error as string) ?? `Failed to save (${res.status})` })
        return
      }
      setPasswordReset(((json.passwordResetEmails as string[]) ?? []).join(", "))
      setStaffChanges(((json.staffChangesEmails as string[]) ?? []).join(", "))
      setMessage({ type: "success", text: "Saved." })
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
          <p className="text-xs text-muted-foreground mt-0.5">
            Choose who is emailed when something needs HR&rsquo;s attention. Separate several addresses with commas
            (up to 5 per field). Leave a field empty to email all HR admins.
          </p>
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

      <form onSubmit={save} className="px-5 py-4 space-y-5">
        <div className="space-y-1.5">
          <label htmlFor="pw-emails" className="text-xs font-semibold text-foreground">Password reset requests go to</label>
          <input id="pw-emails" type="text" value={passwordReset} onChange={(e) => setPasswordReset(e.target.value)}
            placeholder="ujala@wetpaint.co.za" disabled={saving} className={inputClass} />
          <p className="text-xs text-muted-foreground">
            When staff or managers use &ldquo;Forgot password&rdquo;, these people are emailed to set them a temporary password.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="staff-emails" className="text-xs font-semibold text-foreground">Staff changes digests go to</label>
          <input id="staff-emails" type="text" value={staffChanges} onChange={(e) => setStaffChanges(e.target.value)}
            placeholder="ujala@wetpaint.co.za" disabled={saving} className={inputClass} />
          <p className="text-xs text-muted-foreground">
            A daily email when staff change their own profile details (which fields, not the values) and a weekly
            email (Mondays) listing courses staff added.
          </p>
        </div>

        <Button type="submit" size="sm" disabled={saving} className="h-9 gap-1.5">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save
        </Button>
      </form>
    </section>
  )
}
