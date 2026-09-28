"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { KeyRound, Loader2, Copy, Check, ShieldOff, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { accessLabel } from "@/lib/access-levels"

type Login =
  | { state: "none" }
  | { state: "pending" | "active" | "disabled"; role: string; userId: string }

const STATE_LABEL: Record<string, { text: string; cls: string }> = {
  none: { text: "No login", cls: "bg-muted text-muted-foreground border-border" },
  pending: { text: "Not signed in yet", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  active: { text: "Active", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  disabled: { text: "Disabled", cls: "bg-red-50 text-red-700 border-red-200" },
}

// HR-only: create, reset, disable or restore an employee's portal login.
// Logins use a temporary password HR hands over (no emailed links — Safe Links
// consumes them). What they can see is their access level, set in
// Settings → Who can see what (works before they have a login).
export function PortalLoginCard({ employeeId, employeeName }: {
  employeeId: string
  employeeName: string
}) {
  const [login, setLogin] = useState<Login | null>(null)
  const [accessLevel, setAccessLevel] = useState<string>("staff")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [temp, setTemp] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/employees/${employeeId}/login`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        setLogin(d.login ?? { state: "none" })
        setAccessLevel(d.accessLevel ?? "staff")
      })
      .catch(() => { if (!cancelled) setErr("Couldn't load login status") })
    return () => { cancelled = true }
  }, [employeeId])

  async function call(method: "POST" | "DELETE") {
    setBusy(true); setErr(null)
    const res = await fetch(`/api/employees/${employeeId}/login`, { method })
    const data = await res.json().catch(() => null)
    setBusy(false)
    if (!res.ok) { setErr(data?.error ?? "Something went wrong"); return }
    setLogin(data.login)
    if (data.tempPassword) { setTemp(data.tempPassword); setCopied(false) }
  }

  const state = login?.state ?? "none"
  const badge = STATE_LABEL[state]
  const isAdmin = login && login.state !== "none" && login.role === "hr"

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <KeyRound size={15} className="text-primary" />
        <h3 className="text-sm font-semibold">Portal login</h3>
        {login && (
          <span className={cn("text-[11px] font-medium rounded-full border px-2 py-0.5", badge.cls)}>{badge.text}</span>
        )}
        {!login && !err && <Loader2 size={13} className="animate-spin text-muted-foreground" />}
        {login && (
          <span className="text-xs text-muted-foreground">
            Access: {isAdmin ? "HR / Admin" : accessLabel(accessLevel)}
            {!isAdmin && (
              <> · <Link href="/settings?tab=access" className="underline hover:text-foreground">change</Link></>
            )}
          </span>
        )}
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
            <button type="button" onClick={() => call("POST")} disabled={busy}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />} Create login
            </button>
          ) : (
            <>
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
        <p className="text-xs text-muted-foreground">Admin access is managed in Settings → Administrators.</p>
      )}
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  )
}
