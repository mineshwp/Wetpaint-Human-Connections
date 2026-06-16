"use client"

import { useState } from "react"
import { UserCog, Trash2, Plus, Loader2, AlertCircle, CheckCircle2, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface AdminRow {
  id: string
  active_role: string
  employee_id: string | null
  employees: { first_name: string; last_name: string; email: string } | null
  // true = invited but has never signed in yet (awaiting acceptance)
  pending: boolean
}

// Response bodies may be non-JSON (e.g. a 500 HTML error page or a redirect to
// /login). Never let res.json() throw and swallow the failure silently.
async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return await res.json()
  } catch {
    return {}
  }
}

interface AdminsPanelProps {
  initialAdmins: AdminRow[]
  currentUserId: string
}

export function AdminsPanel({ initialAdmins, currentUserId }: AdminsPanelProps) {
  const [admins, setAdmins] = useState<AdminRow[]>(initialAdmins)
  const [email, setEmail] = useState("")
  const [adding, setAdding] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function flash(msg: string, type: "success" | "error") {
    if (type === "success") { setSuccess(msg); setTimeout(() => setSuccess(null), 4000) }
    else { setError(msg); setTimeout(() => setError(null), 6000) }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) return
    if (!trimmed.endsWith("@wetpaint.co.za")) {
      flash("Only @wetpaint.co.za addresses can be granted admin access.", "error")
      return
    }
    setAdding(true)
    try {
      const res = await fetch("/api/settings/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      })
      const json = await readJson(res)
      if (!res.ok) {
        flash((json.error as string) ?? `Failed to add admin (${res.status})`, "error")
        return
      }

      // Refresh the list
      const listRes = await fetch("/api/settings/admins")
      const listJson = await readJson(listRes)
      if (listRes.ok && Array.isArray(listJson.admins)) {
        setAdmins(listJson.admins as AdminRow[])
      }

      setEmail("")
      const name = (json.name as string) ?? trimmed
      const pending = json.pending === true
      flash(
        pending
          ? `Invite sent to ${name}. They'll appear as “Pending” until they accept and sign in.`
          : `${name} has been granted admin access. A notification email has been sent.`,
        "success"
      )
    } catch (err) {
      flash(err instanceof Error ? err.message : "Network error — please try again.", "error")
    } finally {
      setAdding(false)
    }
  }

  async function handleRemove(userId: string, name: string) {
    setError(null)
    setSuccess(null)
    setRemovingId(userId)
    try {
      const res = await fetch(`/api/settings/admins/${userId}`, { method: "DELETE" })
      const json = await readJson(res)
      if (!res.ok) {
        flash((json.error as string) ?? `Failed to remove admin (${res.status})`, "error")
        return
      }
      setAdmins((prev) => prev.filter((a) => a.id !== userId))
      flash(`${name}'s admin access has been removed.`, "success")
    } catch (err) {
      flash(err instanceof Error ? err.message : "Network error — please try again.", "error")
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border bg-muted/30">
        <UserCog className="h-4 w-4 text-primary shrink-0" />
        <div>
          <h2 className="text-sm font-semibold text-foreground">Administrators</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Admins have full access to all employee records and settings.
            Only @wetpaint.co.za accounts can be granted admin access.
          </p>
        </div>
      </div>

      {/* Feedback */}
      {(error || success) && (
        <div className={cn(
          "flex items-start gap-2.5 px-5 py-3 border-b border-border text-sm",
          error ? "bg-red-50 border-red-200 text-red-700" : "bg-green-50 border-green-200 text-green-700"
        )}>
          {error ? <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> : <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />}
          <span>{error ?? success}</span>
        </div>
      )}

      {/* Admin list */}
      <ul className="divide-y divide-border">
        {admins.length === 0 && (
          <li className="px-5 py-8 text-center text-sm text-muted-foreground">
            No admins found.
          </li>
        )}
        {admins.map((admin) => {
          const name = admin.employees
            ? `${admin.employees.first_name} ${admin.employees.last_name}`
            : "Unknown"
          const isSelf = admin.id === currentUserId
          return (
            <li key={admin.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  {admin.employees
                    ? `${admin.employees.first_name[0] ?? ""}${admin.employees.last_name[0] ?? ""}`.toUpperCase()
                    : "?"}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {name}
                    {isSelf && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">(you)</span>
                    )}
                    {admin.pending && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 align-middle">
                        Pending
                      </span>
                    )}
                  </p>
                  {admin.employees?.email && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                      <Mail className="h-3 w-3 shrink-0" />
                      {admin.employees.email}
                    </p>
                  )}
                </div>
              </div>
              {!isSelf && (
                <button
                  onClick={() => handleRemove(admin.id, name)}
                  disabled={removingId === admin.id}
                  className="shrink-0 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors disabled:opacity-50"
                  aria-label={`Remove ${name} as admin`}
                >
                  {removingId === admin.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Trash2 className="h-3.5 w-3.5" />}
                  Remove
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {/* Add admin */}
      <div className="border-t border-border px-5 py-4 bg-muted/20">
        <p className="text-xs font-semibold text-foreground mb-2.5">Grant admin access</p>
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="staff@wetpaint.co.za"
            disabled={adding}
            className={cn(
              "h-9 flex-1 rounded-lg border border-border bg-white px-3 text-sm text-foreground",
              "placeholder:text-muted-foreground outline-none transition-all",
              "focus:border-primary/50 focus:ring-2 focus:ring-primary/20",
              "disabled:opacity-50"
            )}
          />
          <Button type="submit" disabled={adding || !email.trim()} size="sm" className="h-9 gap-1.5">
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add Admin
          </Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          The person must have a <strong>wetpaint.co.za</strong> email and exist as an employee.
          They will receive an email notification and, if not yet registered,
          an invitation to set up their password.
        </p>
      </div>
    </section>
  )
}
