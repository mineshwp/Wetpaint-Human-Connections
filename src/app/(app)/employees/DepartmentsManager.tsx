"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { X, Plus, Pencil, Trash2, Check, Loader2, Building2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface Dept {
  id: string
  name: string
  colour: string
  employee_count: number
}

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

function DeptRow({ dept, others, onSave, onDelete }: {
  dept: Dept
  others: Dept[]
  onSave: (id: string, data: { name: string; colour: string }) => Promise<string | null>
  onDelete: (id: string, opts: { reassignTo?: string; force?: boolean }) => Promise<string | null>
}) {
  const [editing, setEditing] = useState(false)
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
    const e = await onDelete(dept.id, dept.employee_count > 0
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
        <span className="text-xs text-muted-foreground shrink-0">
          {dept.employee_count} staff
        </span>
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
            {dept.employee_count > 0 && (
              <> It has <span className="font-semibold">{dept.employee_count} staff</span>. Choose where to move them:</>
            )}
          </p>
          {dept.employee_count > 0 && (
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

export function DepartmentsManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [depts, setDepts] = useState<Dept[]>([])
  const [loading, setLoading] = useState(false)
  const [loadErr, setLoadErr] = useState<string | null>(null)

  const [newName, setNewName] = useState("")
  const [newColour, setNewColour] = useState(PRESET_COLORS[0])
  const [adding, setAdding] = useState(false)
  const [addErr, setAddErr] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true); setLoadErr(null)
    const res = await fetch("/api/departments?counts=1")
    const data = await res.json().catch(() => null)
    setLoading(false)
    if (!res.ok) { setLoadErr(data?.error ?? "Failed to load departments"); return }
    setDepts((data?.departments ?? []) as Dept[])
    router.refresh() // keep the underlying page's dept filters in sync
  }, [router])

  useEffect(() => { if (open) refresh() }, [open, refresh])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose() }
    if (open) document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose])

  async function add() {
    if (!newName.trim()) { setAddErr("Name is required"); return }
    setAdding(true); setAddErr(null)
    const res = await fetch("/api/departments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), colour: newColour }),
    })
    const data = await res.json().catch(() => null)
    setAdding(false)
    if (!res.ok) { setAddErr(data?.error ?? "Failed to add"); return }
    setNewName(""); setNewColour(PRESET_COLORS[0])
    await refresh()
  }

  async function onSave(id: string, body: { name: string; colour: string }): Promise<string | null> {
    const res = await fetch(`/api/departments/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) return data?.error ?? "Failed to save"
    await refresh()
    return null
  }

  async function onDelete(id: string, opts: { reassignTo?: string; force?: boolean }): Promise<string | null> {
    const qs = new URLSearchParams()
    if (opts.reassignTo) qs.set("reassignTo", opts.reassignTo)
    if (opts.force) qs.set("force", "true")
    const res = await fetch(`/api/departments/${id}${qs.toString() ? `?${qs}` : ""}`, { method: "DELETE" })
    const data = await res.json().catch(() => null)
    if (!res.ok) return data?.error ?? "Failed to delete"
    await refresh()
    return null
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-card border border-border shadow-xl flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-primary" />
            <h2 className="font-bold text-lg">Manage departments</h2>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto space-y-4">
          {/* Add new */}
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2.5">
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

          {/* List */}
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : loadErr ? (
            <p className="text-sm text-destructive">{loadErr}</p>
          ) : depts.length === 0 ? (
            <p className="text-sm text-muted-foreground italic text-center py-4">No departments yet.</p>
          ) : (
            <div className="space-y-2">
              {depts.map((d) => (
                <DeptRow
                  key={d.id}
                  dept={d}
                  others={depts.filter((o) => o.id !== d.id)}
                  onSave={onSave}
                  onDelete={onDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
