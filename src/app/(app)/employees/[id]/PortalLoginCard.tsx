"use client"

import { useEffect, useState } from "react"
import { KeyRound, Loader2, Copy, Check, ShieldOff, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"

type Login =
  | { state: "none" }
  | { state: "pending" | "active" | "disabled"; role: string; managerScope: "department" | "reports" | "line"; userId: string }

// What HR picks on the card = stored role + manager scope.
type Access = "staff" | "manager_reports" | "manager_line" | "manager_department"
const ACCESS_OPTIONS: { value: Access; label: string }[] = [
  { value: "staff", label: "Staff — own profile" },
  { value: "manager_reports", label: "Manager — their direct reports" },
  { value: "manager_line", label: "Manager — their whole reporting line" },
  { value: "manager_department", label: "Manager — their whole department" },
]
const SCOPE_OF: Record<Exclude<Access, "staff">, "reports" | "line" | "department"> = {
  manager_reports: "reports",
  manager_line: "line",
  manager_department: "department",
}
function toBody(a: Access) {
  return a === "staff" ? { role: "staff" } : { role: "manager", manager_scope: SCOPE_OF[a] }
}
function fromLogin(l: Login | null): Access | null {
  if (!l || l.state === "none") return null
  if (l.role !== "manager") return "staff"
  return l.managerScope === "reports" ? "manager_reports" : l.managerScope === "line" ? "manager_line" : "manager_department"
}

const STATE_LABEL: Record<string, { text: string; cls: string }> = {
  none: { text: "No login", cls: "bg-muted text-muted-foreground border-border" },
  pending: { text: "Not signed in yet", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  active: { text: "Active", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  disabled: { text: "Disabled", cls: "bg-red-50 text-red-700 border-red-200" },
}

const ACCESS_LABEL: Record<Access, string> = {
  staff: "Staff",
  manager_reports: "Manager · direct reports",
  manager_line: "Manager · whole reporting line",
  manager_department: "Manager · whole department",
}

// HR-only: create, reset, re-role or disable an employee's portal login.
// Logins use a temporary password HR hands over (no emailed links — Safe Links
// consumes them). A manager's team comes from "Reports to" or their department.
export function PortalLoginCard({ employeeId, employeeName }: {
  employeeId: string
  employeeName: string
}) {
  const [login, setLogin] = useState<Login | null>(null)
  const [access, setAccess] = useState<Access>("staff")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [temp, setTemp] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/employees/${employeeId}/login`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setLogin(d.login ?? { state: "none" }) })
      .catch(() => { if (!cancelled) setErr("Couldn't load login status") })
    return () => { cancelled = true }
  }, [employeeId])

  async function call(method: "POST" | "PATCH" | "DELETE", body?: object) {
    setBusy(true); setErr(null)
    const res = await fetch(`/api/employees/${employeeId}/login`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => null)
    setBusy(false)
    if (!res.ok) { setErr(data?.error ?? "Something went wrong"); return }
    setLogin(data.login)
    if (data.tempPassword) { setTemp(data.tempPassword); setCopied(false) }
  }

  const state = login?.state ?? "none"
  const badge = STATE_LABEL[state]
  const storedRole = login && login.state !== "none" ? login.role : null
  const isAdmin = storedRole === "hr"
  const storedAccess = fromLogin(login)

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <KeyRound size={15} className="text-primary" />
        <h3 className="text-sm font-semibold">Portal login</h3>
        {login && (
          <span className={cn("text-[11px] font-medium rounded-full border px-2 py-0.5", badge.cls)}>{badge.text}</span>
        )}
        {storedRole && (
          <span className="text-xs text-muted-foreground">
            {isAdmin ? "HR / Admin" : storedAccess ? ACCESS_LABEL[storedAccess] : storedRole}
          </span>
        )}
        {!login && !err && <Loader2 size={13} className="animate-spin text-muted-foreground" />}
      </div>

      {temp && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-1.5">
          <p className="text-xs text-foreground">
            Temporary password for <span className="font-semibold">{employeeName}</span> — share it
            with them directly. It is shown only once; they can change it from the user menu after signing in.
          </p>
          <div className="flex items-center gap-2">
            <code className="rounded bg-card border border-border px-2 py-1 text-sm font-mono select-all">{temp}</code>
            <button type="button"
              onClick={() => { navigator.clipboard?.writeText(temp); setCopied(true) }}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">
              {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {login && !isAdmin && (
        <div className="flex items-center gap-2 flex-wrap">
          {state === "none" ? (
            <>
              <select value={access} onChange={(e) => setAccess(e.target.value as Access)} disabled={busy}
                aria-label="Access"
                className="rounded-md border border-border bg-card px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary">
                {ACCESS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <button type="button" onClick={() => call("POST", toBody(access))} disabled={busy}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {busy ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />} Create login
              </button>
            </>
          ) : (
            <>
              <select value={storedAccess ?? "staff"} disabled={busy || state === "disabled"}
                onChange={(e) => call("PATCH", toBody(e.target.value as Access))}
                aria-label="Access"
                className="rounded-md border border-border bg-card px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary">
                {ACCESS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <button type="button" onClick={() => call("POST")} disabled={busy}
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50">
                {state === "disabled" ? <ShieldCheck size={12} /> : <KeyRound size={12} />}
                {state === "disabled" ? "Restore access" : "Reset password"}
              </button>
              {state !== "disabled" && (
                <button type="button" disabled={busy}
                  onClick={() => { if (window.confirm(`Disable ${employeeName}'s login? They won't be able to sign in until you restore access.`)) call("DELETE") }}
                  className="inline-flex items-center gap-1 rounded-md border border-destructive/30 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/5 disabled:opacity-50">
                  <ShieldOff size={12} /> Disable
                </button>
              )}
              {busy && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
            </>
          )}
        </div>
      )}

      {isAdmin && (
        <p className="text-xs text-muted-foreground">Admin access is managed in Settings → Admins.</p>
      )}
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  )
}
