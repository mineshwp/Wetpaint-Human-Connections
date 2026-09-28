"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Loader2, Lock, AlertTriangle, Check, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  CHECKIN_STATUSES, type CheckinStatus, checkinDeadlineLabel, defaultCheckinMonth, monthKey,
  monthLabel, shiftMonth,
} from "@/lib/kpi/checkins"

type Checkin = {
  id: string; employeeId: string; month: string; status: CheckinStatus
  comment: string; authorName: string; updatedAt: string
}
type StaffRow = {
  id: string; name: string; jobTitle: string | null; photoUrl: string | null; initials: string
  department: { name: string; colour: string } | null
  checkin: Checkin | null
}

const STATUS_BY_VALUE = Object.fromEntries(CHECKIN_STATUSES.map((s) => [s.value, s]))

function Avatar({ name, initials, photoUrl }: { name: string; initials: string; photoUrl: string | null }) {
  return photoUrl
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={photoUrl} alt={name} className="h-8 w-8 rounded-full object-cover shrink-0" />
    : <div className="h-8 w-8 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">{initials}</div>
}

function CheckinRow({ row, month, canEdit, onSaved }: {
  row: StaffRow; month: string; canEdit: boolean; onSaved: (c: Checkin) => void
}) {
  const [status, setStatus] = useState<CheckinStatus | null>(row.checkin?.status ?? null)
  const [comment, setComment] = useState(row.checkin?.comment ?? "")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  const dirty = status !== (row.checkin?.status ?? null) || comment.trim() !== (row.checkin?.comment ?? "")

  async function save(nextStatus = status) {
    if (!nextStatus) { setErr("Pick a status first"); return }
    setBusy(true); setErr(null)
    const res = await fetch("/api/kpi/checkins", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employee_id: row.id, month, status: nextStatus, comment }),
    })
    const data = await res.json().catch(() => null)
    setBusy(false)
    if (!res.ok) { setErr(data?.error ?? "Failed to save"); return }
    onSaved(data.checkin)
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 2000)
  }

  const saved = row.checkin

  return (
    <div className={cn("rounded-xl border bg-card p-3 sm:p-4", saved?.status === "concern" ? "border-red-200" : "border-border")}>
      <div className="flex items-start gap-3 flex-wrap sm:flex-nowrap">
        <Avatar name={row.name} initials={row.initials} photoUrl={row.photoUrl} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{row.name}</p>
          <p className="text-xs text-muted-foreground truncate">
            {row.jobTitle ?? "—"}{row.department ? ` · ${row.department.name}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {CHECKIN_STATUSES.map((s) => (
            <button key={s.value} type="button" disabled={!canEdit || busy}
              onClick={() => setStatus(s.value)}
              aria-pressed={status === s.value}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-default",
                status === s.value ? s.cls : "border-border text-muted-foreground hover:bg-muted",
                !canEdit && status !== s.value && "opacity-50",
              )}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2.5 sm:pl-11 space-y-1.5">
        {canEdit ? (
          <div className="flex items-start gap-2">
            <textarea rows={1} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000}
              placeholder="One line on how they're doing this month"
              className="flex-1 min-w-0 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs resize-y focus:outline-none focus:ring-1 focus:ring-primary" />
            <button type="button" onClick={() => save()} disabled={busy || !dirty || !status}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
              {busy ? <Loader2 size={12} className="animate-spin" /> : justSaved ? <Check size={12} /> : null}
              {justSaved ? "Saved" : "Save"}
            </button>
          </div>
        ) : (
          <p className="text-xs text-foreground/80">{saved?.comment || <span className="italic text-muted-foreground">{saved ? "No comment" : "Not done"}</span>}</p>
        )}
        {saved && (
          <p className="text-[11px] text-muted-foreground">
            By {saved.authorName} · {new Date(saved.updatedAt).toLocaleDateString("en-ZA", { dateStyle: "medium" })}
          </p>
        )}
        {err && <p className="text-xs text-destructive">{err}</p>}
      </div>
    </div>
  )
}

// Monthly check-ins for HR and managers.
export function MonthlyCheckins({ isHR }: { isHR: boolean }) {
  const [month, setMonth] = useState(() => defaultCheckinMonth())
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [canEdit, setCanEdit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [filter, setFilter] = useState<"all" | "todo" | "concern">("all")
  const [search, setSearch] = useState("")

  const load = useCallback(async (m: string) => {
    setLoading(true); setLoadErr(null)
    const res = await fetch(`/api/kpi/checkins?month=${m}`)
    const data = await res.json().catch(() => null)
    setLoading(false)
    if (!res.ok) { setLoadErr(data?.error ?? "Failed to load check-ins"); return }
    setStaff(data.staff ?? [])
    setCanEdit(!!data.canEdit)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(month) }, [load, month])

  const counts = useMemo(() => {
    const c = { on_track: 0, needs_support: 0, concern: 0, todo: 0 }
    for (const s of staff) {
      if (s.checkin) c[s.checkin.status]++
      else c.todo++
    }
    return c
  }, [staff])

  const visible = staff.filter((s) => {
    if (filter === "todo" && s.checkin) return false
    if (filter === "concern" && s.checkin?.status !== "concern" && s.checkin?.status !== "needs_support") return false
    if (search && !`${s.name} ${s.jobTitle ?? ""} ${s.department?.name ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const isFuture = month > monthKey(new Date())

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Monthly check-ins</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            A status and one line per person each month, so concerns surface before the quarterly review.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Previous month"
            className="h-9 w-9 rounded-lg border border-border flex items-center justify-center hover:bg-muted"><ChevronLeft size={15} /></button>
          <span className="min-w-[140px] text-center text-sm font-semibold">{monthLabel(month)}</span>
          <button type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))} disabled={isFuture} aria-label="Next month"
            className="h-9 w-9 rounded-lg border border-border flex items-center justify-center hover:bg-muted disabled:opacity-40"><ChevronRight size={15} /></button>
        </div>
      </div>

      {!loading && !loadErr && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          {canEdit && !isHR
            ? <>Open until {checkinDeadlineLabel(month)}.</>
            : !isHR
              ? <><Lock size={12} /> Closed on {checkinDeadlineLabel(month)} — only HR can change these now.</>
              : <>Managers can edit until {checkinDeadlineLabel(month)}; HR can edit any time.</>}
        </p>
      )}

      {counts.concern > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <AlertTriangle size={15} className="shrink-0" />
          {counts.concern} {counts.concern === 1 ? "person has" : "people have"} a Concern this month.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "On track", value: counts.on_track, cls: "text-emerald-700" },
          { label: "Needs support", value: counts.needs_support, cls: "text-amber-700" },
          { label: "Concern", value: counts.concern, cls: "text-red-700" },
          { label: "Not done", value: counts.todo, cls: "text-muted-foreground" },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-card px-3 py-2.5">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{c.label}</div>
            <div className={cn("text-xl font-bold", c.cls)}>{c.value}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search staff"
            className="w-full h-9 rounded-lg border border-border bg-card pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filter"
          className="h-9 rounded-lg border border-border bg-card px-3 text-sm">
          <option value="all">Everyone</option>
          <option value="todo">Not done yet</option>
          <option value="concern">Needs support or Concern</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 size={22} className="animate-spin text-muted-foreground" /></div>
      ) : loadErr ? (
        <p className="text-sm text-destructive">{loadErr}</p>
      ) : staff.length === 0 ? (
        <p className="text-sm text-muted-foreground italic text-center py-10">
          {isHR ? "No active staff." : "No one in your team yet."}
        </p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground italic text-center py-10">Nobody matches this filter.</p>
      ) : (
        <div className="space-y-2">
          {visible.map((row) => (
            <CheckinRow key={`${month}-${row.id}`} row={row} month={month} canEdit={canEdit}
              onSaved={(c) => setStaff((prev) => prev.map((s) => (s.id === row.id ? { ...s, checkin: c } : s)))} />
          ))}
        </div>
      )}
    </div>
  )
}

// Compact strip of a quarter's three check-ins, shown on HR's quarterly review.
export function QuarterCheckinsStrip({ employeeId, period }: { employeeId: string; period: string }) {
  const [data, setData] = useState<{ months: string[]; checkins: Checkin[] } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/kpi/checkins?employee_id=${employeeId}&period=${encodeURIComponent(period)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setData(d) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [employeeId, period])

  if (!data || data.months.length === 0) return null
  const byMonth = new Map(data.checkins.map((c) => [c.month, c]))

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Monthly check-ins</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {data.months.map((m) => {
          const c = byMonth.get(m)
          const s = c ? STATUS_BY_VALUE[c.status] : null
          return (
            <div key={m} className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium">{monthLabel(m).split(" ")[0]}</span>
                {s
                  ? <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", s.cls)}>{s.label}</span>
                  : <span className="text-[10px] text-muted-foreground italic">Not done</span>}
              </div>
              {c?.comment && <p className="text-xs text-foreground/80 mt-0.5 line-clamp-2" title={c.comment}>{c.comment}</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
