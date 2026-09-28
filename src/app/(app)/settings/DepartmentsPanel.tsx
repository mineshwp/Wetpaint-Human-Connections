"use client"

import { useState } from "react"
import Link from "next/link"
import { X, Plus, Pencil, Trash2, Check, Loader2, Building2, UserCog, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type { DepartmentsData, DeptPerson, DeptRow as Dept } from "@/lib/departments"

const PRESET_COLORS = [
  "#6366f1", "#3B82F6", "#0EA5E9", "#14B8A6", "#10B981", "#84CC16",
  "#F59E0B", "#F97316", "#EF4444", "#EC4899", "#8B5CF6", "#64748B",
]

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(
            "h-5 w-5 rounded-full border transition-transform hover:scale-110",
            value.toLowerCase() === c.toLowerCase() ? "ring-2 ring-offset-1 ring-foreground/40 border-transparent" : "border-black/10",
          )}
          style={{ backgroundColor: c }}
          aria-label={c}
        />
      ))}
      <label className="h-5 w-5 rounded-full border border-dashed border-border overflow-hidden cursor-pointer relative" title="Custom colour">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
        <span className="block h-full w-full" style={{ backgroundColor: value }} />
      </label>
    </div>
  )
}

// A department's managers: chips to remove, a picker to add. Picking someone
// from another department moves them into this one.
function Managers({ dept, people, deptName, onSetManagers }: {
  dept: Dept
  people: DeptPerson[]
  deptName: (id: string | null) => string
  onSetManagers: (id: string, employeeIds: string[]) => Promise<string | null>
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const current = dept.managers.map((m) => m.id)
  const candidates = people.filter((p) => !current.includes(p.id))
  const inDept = candidates.filter((p) => p.departmentId === dept.id)
  const elsewhere = candidates.filter((p) => p.departmentId !== dept.id)

  async function set(ids: string[]) {
    setBusy(true); setErr(null)
    const e = await onSetManagers(dept.id, ids)
    setBusy(false)
    if (e) setErr(e)
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground mr-1">
        <UserCog size={12} /> {dept.managers.length > 1 ? "Managers" : "Manager"}:
      </span>
      {dept.managers.length === 0 && <span className="text-xs text-muted-foreground italic">None</span>}
      {dept.managers.map((m) => (
        <span key={m.id} className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 pl-2.5 pr-1 py-0.5 text-xs font-medium">
          {m.name}
          <button type="button" disabled={busy} onClick={() => set(current.filter((x) => x !== m.id))}
            aria-label={`Remove ${m.name} as manager`}
            className="h-4 w-4 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-50">
            <X size={10} />
          </button>
        </span>
      ))}
      <select value="" disabled={busy} aria-label={`Add a manager to ${dept.name}`}
        onChange={(e) => { if (e.target.value) set([...current, e.target.value]) }}
        className="h-6 rounded-full border border-dashed border-border bg-card px-2 text-xs text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
        <option value="">+ Add manager</option>
        {inDept.length > 0 && (
          <optgroup label={`In ${dept.name}`}>
            {inDept.map((p) => <option key={p.id} value={p.id}>{p.name}{p.jobTitle ? ` — ${p.jobTitle}` : ""}</option>)}
          </optgroup>
        )}
        {elsewhere.length > 0 && (
          <optgroup label={`Other people (moves them to ${dept.name})`}>
            {elsewhere.map((p) => <option key={p.id} value={p.id}>{p.name} ({deptName(p.departmentId)})</option>)}
          </optgroup>
        )}
      </select>
      {busy && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
      {err && <p className="basis-full text-xs text-destructive">{err}</p>}
    </div>
  )
}

function DeptRow({ dept, others, people, deptName, onSave, onDelete, onSetManagers }: {
  dept: Dept
  others: Dept[]
  people: DeptPerson[]
  deptName: (id: string | null) => string
  onSave: (id: string, data: { name: string; colour: string }) => Promise<string | null>
  onDelete: (id: string, opts: { reassignTo?: string; force?: boolean }) => Promise<string | null>
  onSetManagers: (id: string, employeeIds: string[]) => Promise<string | null>
}) {
  const [editing, setEditing] = useState(false)
  const [showStaff, setShowStaff] = useState(false)
  const [name, setName] = useState(dept.name)
  const [colour, setColour] = useState(dept.colour)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [reassignTo, setReassignTo] = useState("") // "" = leave unassigned
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    if (!name.trim()) { setErr("Name is required"); return }
    setBusy(true); setErr(null)
    const e = await onSave(dept.id, { name: name.trim(), colour })
    setBusy(false)
    if (e) setErr(e)
    else setEditing(false)
  }

  async function del() {
    setBusy(true); setErr(null)
    const e = await onDelete(dept.id, dept.employeeCount > 0
      ? (reassignTo ? { reassignTo } : { force: true })
      : {})
    setBusy(false)
    if (e) setErr(e)
    // On success the parent refetches and this row unmounts.
  }

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="flex items-center gap-3">
        {editing ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className="flex-1 min-w-0 rounded-md border border-primary bg-card px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        ) : (
          <>
            <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: dept.colour }} />
            <span className="flex-1 min-w-0 truncate text-sm font-medium">{dept.name}</span>
          </>
        )}
        <button type="button" onClick={() => setShowStaff((v) => !v)} aria-expanded={showStaff}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground shrink-0 rounded px-1 -mx-1">
          {dept.members.length} staff
          {dept.employeeCount > dept.members.length && (
            <span className="text-muted-foreground/70">| {dept.employeeCount - dept.members.length} archived</span>
          )}
          <ChevronDown size={12} className={cn("transition-transform", showStaff && "rotate-180")} />
        </button>
        {!editing && !confirming && (
          <div className="flex items-center gap-1 shrink-0">
            <button type="button" onClick={() => { setName(dept.name); setColour(dept.colour); setEditing(true); setErr(null) }}
              className="h-7 w-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/60 transition-colors">
              <Pencil size={12} />
            </button>
            <button type="button" onClick={() => { setConfirming(true); setReassignTo(""); setErr(null) }}
              className="h-7 w-7 rounded-md border border-destructive/30 flex items-center justify-center text-destructive hover:bg-destructive/5 transition-colors">
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>

      {!editing && !confirming && (
        <Managers dept={dept} people={people} deptName={deptName} onSetManagers={onSetManagers} />
      )}

      {showStaff && (
        <div className="mt-2.5 rounded-md border border-border bg-muted/30 px-3 py-2">
          {dept.members.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No current staff.</p>
          ) : (
            <ul className="grid sm:grid-cols-2 gap-x-4 gap-y-1">
              {dept.members.map((m) => (
                <li key={m.id} className="text-xs truncate">
                  <Link href={`/employees/${m.id}`} className="font-medium hover:text-primary hover:underline">{m.name}</Link>
                  {m.jobTitle && <span className="text-muted-foreground"> — {m.jobTitle}</span>}
                  {dept.managers.some((x) => x.id === m.id) && <span className="ml-1 text-[10px] font-semibold text-primary uppercase">Manager</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {editing && (
        <div className="mt-2.5 space-y-2.5">
          <ColorPicker value={colour} onChange={setColour} />
          <div className="flex items-center gap-2">
            <button type="button" onClick={save} disabled={busy}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save
            </button>
            <button type="button" onClick={() => { setEditing(false); setErr(null) }} disabled={busy}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted">
              Cancel
            </button>
          </div>
        </div>
      )}

      {confirming && (
        <div className="mt-2.5 space-y-2.5 rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
          <p className="text-xs text-foreground">
            Delete <span className="font-semibold">{dept.name}</span>?
            {dept.managers.length > 0 && (
              <> {dept.managers.map((m) => m.name).join(" and ")} will no longer be department {dept.managers.length === 1 ? "manager" : "managers"}.</>
            )}
            {dept.employeeCount > 0 && (
              <> It has <span className="font-semibold">{dept.members.length} staff{dept.employeeCount > dept.members.length ? ` and ${dept.employeeCount - dept.members.length} archived` : ""}</span>. Choose where to move them:</>
            )}
          </p>
          {dept.employeeCount > 0 && (
            <select
              value={reassignTo}
              onChange={(e) => setReassignTo(e.target.value)}
              className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Leave unassigned (no department)</option>
              {others.map((d) => (
                <option key={d.id} value={d.id}>Move to “{d.name}”</option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-2">
            <button type="button" onClick={del} disabled={busy}
              className="inline-flex items-center gap-1 rounded-md bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Delete
            </button>
            <button type="button" onClick={() => { setConfirming(false); setErr(null) }} disabled={busy}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted">
              Cancel
            </button>
          </div>
        </div>
      )}

      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
    </div>
  )
}

// Settings → Departments (HR only): add, rename, recolour and delete
// departments, and choose each one's managers (a department can have several).
export function DepartmentsPanel({ initial }: { initial: DepartmentsData }) {
  const [data, setData] = useState(initial)
  const depts = data.departments

  const [newName, setNewName] = useState("")
  const [newColour, setNewColour] = useState(PRESET_COLORS[0])
  const [adding, setAdding] = useState(false)
  const [addErr, setAddErr] = useState<string | null>(null)

  const names = new Map(depts.map((d) => [d.id, d.name]))
  const deptName = (id: string | null) => (id && names.get(id)) || "no department"

  async function refresh(): Promise<string | null> {
    const res = await fetch("/api/settings/departments")
    const body = await res.json().catch(() => null)
    if (!res.ok) return body?.error ?? "Failed to load departments"
    setData(body as DepartmentsData)
    return null
  }

  async function add() {
    if (!newName.trim()) { setAddErr("Name is required"); return }
    setAdding(true); setAddErr(null)
    const res = await fetch("/api/departments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), colour: newColour }),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) { setAdding(false); setAddErr(body?.error ?? "Failed to add"); return }
    setNewName(""); setNewColour(PRESET_COLORS[0])
    setAddErr(await refresh())
    setAdding(false)
  }

  async function onSave(id: string, body: { name: string; colour: string }): Promise<string | null> {
    const res = await fetch(`/api/departments/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    })
    const out = await res.json().catch(() => null)
    if (!res.ok) return out?.error ?? "Failed to save"
    return refresh()
  }

  async function onDelete(id: string, opts: { reassignTo?: string; force?: boolean }): Promise<string | null> {
    const qs = new URLSearchParams()
    if (opts.reassignTo) qs.set("reassignTo", opts.reassignTo)
    if (opts.force) qs.set("force", "true")
    const res = await fetch(`/api/departments/${id}${qs.toString() ? `?${qs}` : ""}`, { method: "DELETE" })
    const out = await res.json().catch(() => null)
    if (!res.ok) return out?.error ?? "Failed to delete"
    return refresh()
  }

  async function onSetManagers(id: string, employeeIds: string[]): Promise<string | null> {
    const res = await fetch(`/api/departments/${id}/managers`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employee_ids: employeeIds }),
    })
    const out = await res.json().catch(() => null)
    if (!res.ok) return out?.error ?? "Failed to save managers"
    setData(out as DepartmentsData)
    return null
  }

  return (
    <section className="rounded-2xl border border-border bg-card">
      <div className="px-5 py-4 border-b border-border space-y-1">
        <div className="flex items-center gap-2">
          <Building2 size={18} className="text-primary" />
          <h2 className="font-bold text-lg">Departments</h2>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Add, rename or delete departments and choose who manages each one — a department can have more than one manager.
          A department manager sees everyone in their department (their access becomes
          &ldquo;Manager — whole department&rdquo; in <span className="font-medium">Who can see what</span>).
          Taking someone off goes back to &ldquo;direct reports&rdquo; if people report to them, otherwise Staff.
        </p>
      </div>

      <div className="px-5 py-4 space-y-4">
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2.5 max-w-lg">
          <p className="text-sm font-semibold">Add a department</p>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Department name"
            onKeyDown={(e) => { if (e.key === "Enter") add() }}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <ColorPicker value={newColour} onChange={setNewColour} />
          {addErr && <p className="text-xs text-destructive">{addErr}</p>}
          <button type="button" onClick={add} disabled={adding || !newName.trim()}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {adding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add department
          </button>
        </div>

        {depts.length === 0 ? (
          <p className="text-sm text-muted-foreground italic text-center py-4">No departments yet.</p>
        ) : (
          <div className="space-y-2">
            {depts.map((d) => (
              <DeptRow
                key={d.id}
                dept={d}
                others={depts.filter((o) => o.id !== d.id)}
                people={data.people}
                deptName={deptName}
                onSave={onSave}
                onDelete={onDelete}
                onSetManagers={onSetManagers}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
