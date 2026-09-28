"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ChevronRight, GitBranch, Loader2, Search, ShieldCheck, UserMinus, UserPlus, Users, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { ACCESS_LEVELS, type AccessLevel } from "@/lib/access-levels"
import { visibleTo, type AccessData, type AccessPerson } from "@/lib/access-visibility"

const LOGIN_BADGE: Record<AccessPerson["login"], { text: string; cls: string }> = {
  none: { text: "No login", cls: "bg-muted text-muted-foreground border-border" },
  pending: { text: "Not signed in yet", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  active: { text: "Active", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  disabled: { text: "Disabled", cls: "bg-red-50 text-red-700 border-red-200" },
}

const selectCls = "h-8 rounded-md border border-border bg-card px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"

type Patch = { employee_ids: string[]; manager_id?: string | null; access_level?: AccessLevel }

// HR's one place to arrange who sees what: set each person's "Reports to" and
// access level (works before they have a login), in bulk, with filters and a
// team view. Everything saves immediately and is checked on the server.
export function AccessOverview({ initial }: { initial: AccessData }) {
  const [data, setData] = useState(initial)
  const [q, setQ] = useState("")
  const [dept, setDept] = useState("all")
  const [access, setAccess] = useState("all")
  const [login, setLogin] = useState("all")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkManager, setBulkManager] = useState("")
  const [bulkAccess, setBulkAccess] = useState<AccessLevel | "">("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [teamOf, setTeamOf] = useState<string | null>(null)

  const byId = useMemo(() => new Map(data.people.map((p) => [p.id, p])), [data.people])
  const deptName = useMemo(() => new Map(data.departments.map((d) => [d.id, d.name])), [data.departments])

  const visible = data.people.filter((p) => {
    if (dept !== "all" && (dept === "none" ? p.departmentId : p.departmentId !== dept)) return false
    if (access !== "all" && (access === "admin" ? !p.isAdmin : p.isAdmin || p.accessLevel !== access)) return false
    if (login !== "all" && p.login !== login) return false
    if (q) {
      const hay = `${p.name} ${p.jobTitle ?? ""} ${deptName.get(p.departmentId ?? "") ?? ""} ${byId.get(p.managerId ?? "")?.name ?? ""}`.toLowerCase()
      if (!hay.includes(q.toLowerCase())) return false
    }
    return true
  })

  async function save(patch: Patch, success: string) {
    setBusy(true); setMsg(null)
    const res = await fetch("/api/settings/access", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    })
    const json = await res.json().catch(() => null)
    setBusy(false)
    if (!res.ok) { setMsg({ ok: false, text: json?.error ?? "Failed to save" }); return false }
    setData(json)
    setMsg({ ok: true, text: success })
    return true
  }

  const allVisibleSelected = visible.length > 0 && visible.every((p) => selected.has(p.id))
  function toggleAll() {
    const next = new Set(selected)
    if (allVisibleSelected) visible.forEach((p) => next.delete(p.id))
    else visible.forEach((p) => next.add(p.id))
    setSelected(next)
  }
  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelected(next)
  }

  function seesText(p: AccessPerson) {
    const v = visibleTo(p, data.people)
    if (v === "everyone") return { count: null as number | null, text: "Everyone" }
    if (p.accessLevel === "staff") return { count: 0, text: "Own profile only" }
    if (v.length === 0) {
      return { count: 0, text: p.accessLevel === "manager_department" ? "Nobody — no department set" : "Nobody yet — add people to their team" }
    }
    return { count: v.length, text: v.map((id) => byId.get(id)?.name.split(" ")[0]).join(", ") }
  }

  const otherPeople = data.people

  return (
    <section className="rounded-2xl border border-border bg-card">
      <div className="px-5 py-4 border-b border-border space-y-1">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-primary" />
          <h2 className="font-bold text-lg">Who can see what</h2>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Set each person&apos;s <span className="font-medium">Reports to</span> and <span className="font-medium">access</span> here —
          it works before they have a login, so everything is ready when you create one. Managers see their team&apos;s
          profiles (no ID, date of birth, banking, salary or documents) and published KPI reviews.
          Everyone can always see their own profile. HR admins see everyone.
        </p>
      </div>

      {/* Filters */}
      <div className="px-5 py-3 border-b border-border flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, title or manager"
            className="w-full h-8 rounded-md border border-border bg-card pl-8 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <select value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department" className={selectCls}>
          <option value="all">All departments</option>
          {data.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          <option value="none">No department</option>
        </select>
        <select value={access} onChange={(e) => setAccess(e.target.value)} aria-label="Access" className={selectCls}>
          <option value="all">All access levels</option>
          {ACCESS_LEVELS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          <option value="admin">HR / Admin</option>
        </select>
        <select value={login} onChange={(e) => setLogin(e.target.value)} aria-label="Login" className={selectCls}>
          <option value="all">Any login status</option>
          <option value="none">No login</option>
          <option value="pending">Not signed in yet</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="px-5 py-2.5 border-b border-border bg-primary/5 flex items-center gap-2 flex-wrap text-xs">
          <span className="font-semibold">{selected.size} selected</span>
          <span className="text-muted-foreground">·</span>
          <span>Reports to</span>
          <select value={bulkManager} onChange={(e) => setBulkManager(e.target.value)} aria-label="Set reports to" className={selectCls}>
            <option value="">Choose…</option>
            <option value="__none">No one</option>
            {otherPeople.filter((p) => !selected.has(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button type="button" disabled={busy || !bulkManager}
            onClick={async () => {
              const ok = await save(
                { employee_ids: [...selected], manager_id: bulkManager === "__none" ? null : bulkManager },
                `Updated Reports to for ${selected.size} ${selected.size === 1 ? "person" : "people"}.`
              )
              if (ok) setBulkManager("")
            }}
            className="h-8 rounded-md bg-primary px-3 font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40">Apply</button>
          <span className="text-muted-foreground">·</span>
          <span>Access</span>
          <select value={bulkAccess} onChange={(e) => setBulkAccess(e.target.value as AccessLevel | "")} aria-label="Set access" className={selectCls}>
            <option value="">Choose…</option>
            {ACCESS_LEVELS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
          <button type="button" disabled={busy || !bulkAccess}
            onClick={async () => {
              const ok = await save({ employee_ids: [...selected], access_level: bulkAccess as AccessLevel }, `Updated access for ${selected.size} ${selected.size === 1 ? "person" : "people"}.`)
              if (ok) setBulkAccess("")
            }}
            className="h-8 rounded-md bg-primary px-3 font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40">Apply</button>
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <X size={12} /> Clear
          </button>
        </div>
      )}

      {(msg || busy) && (
        <div className="px-5 pt-3 text-xs flex items-center gap-1.5">
          {busy && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
          {msg && <span className={msg.ok ? "text-emerald-700" : "text-destructive"}>{msg.text}</span>}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 w-8">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} aria-label="Select all shown" />
              </th>
              <th className="text-left font-semibold px-2 py-2">Person</th>
              <th className="text-left font-semibold px-2 py-2">Reports to</th>
              <th className="text-left font-semibold px-2 py-2">Access</th>
              <th className="text-left font-semibold px-2 py-2">Can see</th>
              <th className="text-left font-semibold px-4 py-2">Login</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.map((p) => {
              const sees = seesText(p)
              const b = LOGIN_BADGE[p.login]
              return (
                <tr key={p.id} className={cn("align-top", selected.has(p.id) && "bg-primary/5")}>
                  <td className="px-4 py-2.5">
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Select ${p.name}`} />
                  </td>
                  <td className="px-2 py-2.5 min-w-[160px]">
                    <Link href={`/employees/${p.id}`} className="font-medium hover:text-primary">{p.name}</Link>
                    <div className="text-xs text-muted-foreground">
                      {[p.jobTitle, deptName.get(p.departmentId ?? "") ?? "No department"].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td className="px-2 py-2.5">
                    <select value={p.managerId ?? ""} disabled={busy} aria-label={`${p.name} reports to`}
                      onChange={(e) => save({ employee_ids: [p.id], manager_id: e.target.value || null }, `${p.name} now reports to ${byId.get(e.target.value)?.name ?? "no one"}.`)}
                      className={cn(selectCls, "max-w-[170px]")}>
                      <option value="">No one</option>
                      {otherPeople.filter((x) => x.id !== p.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-2.5">
                    {p.isAdmin ? (
                      <span className="text-xs font-medium">HR / Admin</span>
                    ) : (
                      <select value={p.accessLevel} disabled={busy} aria-label={`${p.name} access`}
                        onChange={(e) => save({ employee_ids: [p.id], access_level: e.target.value as AccessLevel }, `${p.name}'s access updated.`)}
                        className={cn(selectCls, "max-w-[200px]")}>
                        {ACCESS_LEVELS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="px-2 py-2.5 min-w-[180px]">
                    {p.accessLevel !== "staff" && !p.isAdmin ? (
                      <button type="button" onClick={() => setTeamOf(p.id)} className="text-left group">
                        <span className="text-xs">
                          {sees.count ? <span className="font-semibold">{sees.count} · </span> : null}
                          <span className="text-foreground/80 group-hover:text-primary">{sees.text}</span>
                        </span>
                        <span className="flex items-center gap-0.5 text-[11px] text-primary mt-0.5"><GitBranch size={11} /> Team view</span>
                      </button>
                    ) : (
                      <span className="text-xs text-foreground/80">{sees.text}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={cn("text-[11px] font-medium rounded-full border px-2 py-0.5 whitespace-nowrap", b.cls)}>{b.text}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {visible.length === 0 && <p className="px-5 py-6 text-sm text-muted-foreground italic">Nobody matches these filters.</p>}
      </div>

      {teamOf && byId.get(teamOf) && (
        <TeamView person={byId.get(teamOf)!} data={data} busy={busy} onClose={() => setTeamOf(null)} onSave={save} deptName={deptName} />
      )}
    </section>
  )
}

// A manager's reporting tree, with add/remove. Adding sets the people's
// "Reports to" to this manager; removing clears it (they report to no one).
function TeamView({ person, data, busy, onClose, onSave, deptName }: {
  person: AccessPerson
  data: AccessData
  busy: boolean
  onClose: () => void
  onSave: (patch: Patch, success: string) => Promise<boolean>
  deptName: Map<string, string>
}) {
  const [adding, setAdding] = useState<Set<string>>(new Set())
  const [addQ, setAddQ] = useState("")
  const children = (id: string) => data.people.filter((p) => p.managerId === id && p.id !== id)
  const visible = new Set(visibleTo(person, data.people) === "everyone" ? [] : (visibleTo(person, data.people) as string[]))
  const level = ACCESS_LEVELS.find((a) => a.value === person.accessLevel)

  function Branch({ id, depth, seen }: { id: string; depth: number; seen: Set<string> }) {
    const kids = children(id).filter((k) => !seen.has(k.id))
    if (kids.length === 0) return null
    const nextSeen = new Set([...seen, ...kids.map((k) => k.id)])
    return (
      <ul className={cn("space-y-1", depth > 0 && "ml-5 border-l border-border pl-3")}>
        {kids.map((k) => (
          <li key={k.id}>
            <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40">
              {depth > 0 && <ChevronRight size={12} className="text-muted-foreground" />}
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium">{k.name}</span>
                <span className="text-xs text-muted-foreground"> · {k.jobTitle ?? "—"}{k.departmentId ? ` · ${deptName.get(k.departmentId)}` : ""}</span>
                {!visible.has(k.id) && <span className="ml-1.5 text-[10px] text-amber-700">(not visible with current access)</span>}
              </div>
              {depth === 0 && (
                <button type="button" disabled={busy} title={`Remove ${k.name} from ${person.name}'s direct team`}
                  onClick={() => onSave({ employee_ids: [k.id], manager_id: null }, `${k.name} no longer reports to ${person.name}.`)}
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive disabled:opacity-40">
                  <UserMinus size={12} /> Remove
                </button>
              )}
            </div>
            <Branch id={k.id} depth={depth + 1} seen={nextSeen} />
          </li>
        ))}
      </ul>
    )
  }

  const candidates = data.people.filter((p) =>
    p.id !== person.id && p.managerId !== person.id &&
    (!addQ || `${p.name} ${p.jobTitle ?? ""}`.toLowerCase().includes(addQ.toLowerCase()))
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-card border border-border shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><Users size={17} className="text-primary" /><h3 className="font-bold text-lg">{person.name}&apos;s team</h3></div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Access: {level?.label ?? "Staff"} — {level?.help}. Showing everyone who reports to them, and below.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="px-5 py-4 overflow-y-auto space-y-4">
          {children(person.id).length === 0
            ? <p className="text-sm text-muted-foreground italic">Nobody reports to {person.name.split(" ")[0]} yet.</p>
            : <Branch id={person.id} depth={0} seen={new Set([person.id])} />}

          <div className="rounded-lg border border-border p-3 space-y-2">
            <p className="text-sm font-semibold flex items-center gap-1.5"><UserPlus size={14} /> Add people who report to {person.name.split(" ")[0]}</p>
            <input value={addQ} onChange={(e) => setAddQ(e.target.value)} placeholder="Search staff"
              className="w-full h-8 rounded-md border border-border bg-card px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
            <div className="max-h-48 overflow-y-auto divide-y divide-border rounded-md border border-border">
              {candidates.map((c) => (
                <label key={c.id} className="flex items-center gap-2 px-2.5 py-1.5 text-xs cursor-pointer hover:bg-muted/40">
                  <input type="checkbox" checked={adding.has(c.id)}
                    onChange={() => { const n = new Set(adding); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); setAdding(n) }} />
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted-foreground truncate">
                    {c.jobTitle ?? ""}{c.managerId ? ` · now reports to ${data.people.find((x) => x.id === c.managerId)?.name ?? "someone"}` : ""}
                  </span>
                </label>
              ))}
              {candidates.length === 0 && <p className="px-2.5 py-2 text-xs text-muted-foreground italic">No one else to add.</p>}
            </div>
            <button type="button" disabled={busy || adding.size === 0}
              onClick={async () => {
                const ok = await onSave({ employee_ids: [...adding], manager_id: person.id }, `${adding.size} ${adding.size === 1 ? "person now reports" : "people now report"} to ${person.name}.`)
                if (ok) setAdding(new Set())
              }}
              className="h-8 inline-flex items-center gap-1 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />} Add {adding.size || ""} to team
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
