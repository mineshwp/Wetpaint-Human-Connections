"use client"

import { useState, useEffect, useCallback } from "react"
import {
  ChevronDown, Plus, Trash2, X, Check,
  Users, UserPlus, Send, Clock, CheckCircle2, XCircle,
  Loader2, BarChart3, FileText,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// ─── Types ─────────────────────────────────────────────────────────────────────

interface TemplateItem {
  id: string; section_id: string; title: string; description: string | null
  min_score: number; max_score: number; position: number; is_active: boolean
}
interface TemplateSection {
  id: string; title: string; type: "invitee" | "hr"
  position: number; is_active: boolean
  kpi_template_items: TemplateItem[]
}
interface ReviewInvitee {
  id: string; invitee_id: string; status: "pending" | "accepted" | "declined" | "completed"
  invitee: { id: string; first_name: string; last_name: string }
}
interface Review {
  id: string; employee_id: string; period: string; title: string
  deadline: string | null; status: "draft" | "active" | "completed"
  employee: { id: string; first_name: string; last_name: string; job_title: string; department: { name: string } | null }
  kpi_review_invitees: ReviewInvitee[]
}
interface Score {
  id: string; review_id: string; item_id: string
  scorer_id: string | null; score: number | null; comments: string | null
}
interface Employee {
  id: string; first_name: string; last_name: string; job_title: string; email?: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

const INVITEE_STATUS: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  pending:   { label: "Pending",   cls: "bg-amber-50 text-amber-700 border-amber-200",       icon: Clock        },
  accepted:  { label: "Accepted",  cls: "bg-blue-50 text-blue-700 border-blue-200",          icon: CheckCircle2 },
  declined:  { label: "Declined",  cls: "bg-red-50 text-red-700 border-red-200",             icon: XCircle      },
  completed: { label: "Completed", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
}

const REVIEW_STATUS_CLS: Record<string, string> = {
  draft:     "bg-muted text-muted-foreground border-border",
  active:    "bg-blue-50 text-blue-700 border-blue-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
}

const AVATAR_COLORS = [
  "#3B82F6","#10B981","#F59E0B","#8B5CF6","#EC4899","#14B8A6","#F97316","#6366F1",
]

function InviteeStatusBadge({ status }: { status: string }) {
  const m = INVITEE_STATUS[status] ?? INVITEE_STATUS.pending
  const Icon = m.icon as React.ElementType
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", m.cls)}>
      <Icon size={10} /> {m.label}
    </span>
  )
}

function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const initials = name.split(" ").map(n => n[0] ?? "").join("").slice(0, 2).toUpperCase()
  const bg = AVATAR_COLORS[(name.charCodeAt(0) + (name.charCodeAt(1) ?? 0)) % AVATAR_COLORS.length]
  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-bold shrink-0 text-white",
        size === "sm" ? "w-6 h-6 text-[10px]" : size === "lg" ? "w-11 h-11 text-sm" : "w-8 h-8 text-xs",
      )}
      style={{ backgroundColor: bg }}
    >
      {initials}
    </div>
  )
}

// ─── Scorer Row ─────────────────────────────────────────────────────────────────

function ScorerRow({ name, role, scoreObj, canEdit, item, onSave }: {
  name: string; role: string; scoreObj: Score | undefined; canEdit: boolean
  item: TemplateItem; onSave: (score: number | null, comments: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(scoreObj?.score?.toString() ?? "")
  const [comm, setComm]       = useState(scoreObj?.comments ?? "")
  const [saving, setSaving]   = useState(false)
  const hasScore = scoreObj?.score !== null && scoreObj?.score !== undefined

  async function handleSave() {
    setSaving(true)
    await onSave(val === "" ? null : Number(val), comm)
    setSaving(false)
    setEditing(false)
  }

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="grid items-center gap-2 px-3 py-2.5" style={{ gridTemplateColumns: "1fr 60px 28px" }}>
        <div className="flex items-center gap-2 min-w-0">
          <Avatar name={name} size="sm" />
          <div className="min-w-0">
            <div className="text-xs font-semibold truncate">{name}</div>
            <div className="text-[10px] text-muted-foreground">{role}</div>
          </div>
        </div>
        {canEdit && !editing ? (
          <button
            type="button" onClick={() => setEditing(true)}
            className={cn(
              "rounded-md px-1.5 py-1 text-sm font-bold text-center border transition-colors w-full",
              hasScore
                ? "border-border text-foreground hover:border-primary/50"
                : "border-dashed border-border text-muted-foreground hover:border-primary/50 hover:bg-primary/5",
            )}
          >
            {hasScore ? scoreObj!.score : "—"}
          </button>
        ) : canEdit && editing ? (
          <input
            type="number" min={item.min_score} max={item.max_score}
            value={val} onChange={e => setVal(e.target.value)} autoFocus
            className="w-full border border-primary rounded-md px-1.5 py-1 text-sm font-bold text-center bg-primary/5 text-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        ) : (
          <div className="text-sm font-bold text-center">
            {hasScore ? scoreObj!.score : <span className="text-muted-foreground">—</span>}
          </div>
        )}
        <div className="flex justify-center">
          <div className={cn("w-2 h-2 rounded-full", hasScore ? "bg-emerald-500" : "bg-amber-300")} />
        </div>
      </div>
      {editing && canEdit && (
        <div className="px-3 pb-3 space-y-2">
          <textarea
            rows={2} value={comm} onChange={e => setComm(e.target.value)}
            placeholder="Add a comment or evidence…"
            className="w-full border border-border rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary bg-card"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving} className="h-7 text-xs gap-1 px-3">
              {saving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} Save
            </Button>
            <Button size="sm" variant="ghost"
              onClick={() => { setEditing(false); setVal(scoreObj?.score?.toString() ?? ""); setComm(scoreObj?.comments ?? "") }}
              className="h-7 text-xs px-3"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── KPI Card ───────────────────────────────────────────────────────────────────

function KpiCard({ item, itemIndex, sectionType, scores, invitees, isHR, currentEmployeeId, onScoreChange }: {
  item: TemplateItem; itemIndex: number; sectionType: "invitee" | "hr"
  scores: Score[]; invitees: ReviewInvitee[]; isHR: boolean; currentEmployeeId: string | null
  onScoreChange: (itemId: string, score: number | null, comments: string) => Promise<void>
}) {
  const scoreMap = new Map<string, Score>()
  for (const s of scores) scoreMap.set(`${s.item_id}::${s.scorer_id ?? "hr"}`, s)

  const activeInvitees = invitees.filter(i => i.status === "accepted" || i.status === "completed")

  const numericScores: number[] = []
  if (sectionType === "hr") {
    const v = scoreMap.get(`${item.id}::hr`)?.score
    if (v != null) numericScores.push(v)
  } else {
    for (const inv of activeInvitees) {
      const v = scoreMap.get(`${item.id}::${inv.invitee_id}`)?.score
      if (v != null) numericScores.push(v)
    }
  }
  const avgScore = numericScores.length > 0
    ? numericScores.reduce((a, b) => a + b, 0) / numericScores.length
    : null

  const comments: { name: string; score: number | null; comment: string }[] = []
  if (sectionType === "hr") {
    const sc = scoreMap.get(`${item.id}::hr`)
    if (sc?.comments) comments.push({ name: "HR / Admin", score: sc.score, comment: sc.comments })
  } else {
    for (const inv of activeInvitees) {
      const sc = scoreMap.get(`${item.id}::${inv.invitee_id}`)
      if (sc?.comments) comments.push({ name: `${inv.invitee.first_name} ${inv.invitee.last_name}`, score: sc.score, comment: sc.comments })
    }
  }

  const scorerRows: { key: string; name: string; role: string; scoreObj: Score | undefined; canEdit: boolean }[] = []
  if (sectionType === "hr") {
    scorerRows.push({ key: "hr", name: "HR / Admin", role: "HR", scoreObj: scoreMap.get(`${item.id}::hr`), canEdit: isHR })
  } else {
    for (const inv of activeInvitees) {
      scorerRows.push({
        key: inv.invitee_id,
        name: `${inv.invitee.first_name} ${inv.invitee.last_name}`,
        role: "Peer",
        scoreObj: scoreMap.get(`${item.id}::${inv.invitee_id}`),
        canEdit: inv.invitee_id === currentEmployeeId,
      })
    }
  }

  return (
    <article className="border border-border rounded-xl overflow-hidden bg-card transition-shadow hover:shadow-sm">
      <div className="flex justify-between items-start px-5 py-4 bg-muted/20 border-b border-border gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              KPI {itemIndex + 1} · Max {item.max_score}
            </span>
          </div>
          <h3 className="font-semibold text-[15px] text-foreground leading-snug">{item.title}</h3>
        </div>
        {avgScore !== null && (
          <div className="text-right shrink-0">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Avg Score</div>
            <div className="text-2xl font-bold leading-none text-foreground">
              {avgScore % 1 === 0 ? avgScore : avgScore.toFixed(1)}
              <span className="text-muted-foreground font-medium text-sm"> / {item.max_score}</span>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] divide-y lg:divide-y-0 lg:divide-x divide-border">
        <div className="px-5 py-4 space-y-4">
          <div>
            <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Description</h4>
            {item.description
              ? <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
              : <p className="text-sm text-muted-foreground italic">No description provided.</p>
            }
          </div>
          {comments.length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Comments &amp; Evidence</h4>
              <div className="flex flex-col gap-2">
                {comments.map((c, i) => (
                  <div key={i} className="flex gap-3 bg-muted/30 rounded-xl p-3">
                    <Avatar name={c.name} size="sm" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-semibold">{c.name}</span>
                        {c.score !== null && c.score !== undefined && (
                          <span className="text-[10px] font-bold bg-primary/10 text-primary rounded-full px-2 py-0.5">
                            {c.score}/{item.max_score}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{c.comment}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 space-y-3">
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Scorers</h4>
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="grid items-center gap-2 px-3 py-2 bg-muted/30 border-b border-border" style={{ gridTemplateColumns: "1fr 60px 28px" }}>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Person</span>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Score</span>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">✓</span>
            </div>
            {scorerRows.length === 0
              ? <div className="px-3 py-4 text-xs text-muted-foreground text-center italic">No scorers assigned yet.</div>
              : scorerRows.map(row => (
                  <ScorerRow
                    key={row.key} name={row.name} role={row.role}
                    scoreObj={row.scoreObj} canEdit={row.canEdit} item={item}
                    onSave={(score, comm) => onScoreChange(item.id, score, comm)}
                  />
                ))
            }
            <div className="px-3 py-2.5 border-t border-dashed border-border bg-muted/10 flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">
                {sectionType === "hr" ? "HR score is the final score" : "Final score is the weighted average"}
              </span>
            </div>
          </div>
          {avgScore !== null && (
            <div className="px-4 py-3 bg-primary/5 border border-primary/20 rounded-xl flex items-center justify-between">
              <span className="text-[11px] font-semibold text-primary uppercase tracking-wider">Final Score</span>
              <span className="text-xl font-bold text-primary">
                {avgScore % 1 === 0 ? avgScore : avgScore.toFixed(1)}
                <span className="text-primary/60 font-medium text-sm"> / {item.max_score}</span>
              </span>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

// ─── Section Accordion ──────────────────────────────────────────────────────────

function SectionAccordion({ section, sectionIndex, scores, invitees, isHR, currentEmployeeId, onScoreChange, onAddItem, defaultOpen }: {
  section: TemplateSection; sectionIndex: number; scores: Score[]; invitees: ReviewInvitee[]
  isHR: boolean; currentEmployeeId: string | null
  onScoreChange: (itemId: string, score: number | null, comments: string) => Promise<void>
  onAddItem?: (sectionId: string, data: { title: string; description: string; min_score: number; max_score: number }) => Promise<void>
  defaultOpen?: boolean
}) {
  const [open, setOpen]             = useState(defaultOpen ?? sectionIndex === 0)
  const [showAdd, setShowAdd]       = useState(false)
  const [newTitle, setNewTitle]     = useState("")
  const [newDesc, setNewDesc]       = useState("")
  const [newMax, setNewMax]         = useState(10)
  const [addSaving, setAddSaving]   = useState(false)

  const items = section.kpi_template_items ?? []
  const sectionMax = items.reduce((a, i) => a + i.max_score, 0)
  const scoreMap = new Map<string, Score>()
  for (const s of scores) scoreMap.set(`${s.item_id}::${s.scorer_id ?? "hr"}`, s)
  const activeInvitees = invitees.filter(i => i.status === "accepted" || i.status === "completed")

  const sectionCurrent = (() => {
    if (section.type === "hr") {
      return items.reduce((a, item) => a + (scoreMap.get(`${item.id}::hr`)?.score ?? 0), 0)
    }
    if (activeInvitees.length === 0) return 0
    return items.reduce((total, item) => {
      const vals = activeInvitees
        .map(inv => scoreMap.get(`${item.id}::${inv.invitee_id}`)?.score)
        .filter((v): v is number => v != null)
      if (vals.length === 0) return total
      return total + vals.reduce((a, b) => a + b, 0) / vals.length
    }, 0)
  })()

  const progressPct = sectionMax > 0 ? Math.min(100, (sectionCurrent / sectionMax) * 100) : 0

  return (
    <div className={cn("rounded-xl border bg-card overflow-hidden transition-all", open ? "border-border shadow-md" : "border-border shadow-sm")}>
      <button
        type="button" onClick={() => setOpen(o => !o)}
        className={cn("w-full grid items-center gap-4 px-5 py-4 text-left transition-colors", open ? "border-b border-border" : "hover:bg-muted/20")}
        style={{ gridTemplateColumns: "48px 1fr auto auto auto" }}
      >
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center font-bold text-[15px] shrink-0 transition-all", open ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground")}>
          {sectionIndex + 1}
        </div>
        <div className="min-w-0">
          <p className="font-bold text-[15px] text-foreground leading-snug">{section.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {items.length} KPI{items.length !== 1 ? "s" : ""} · Max score {sectionMax}
            {section.type === "hr" ? " · Scored by HR" : " · Scored by peers & manager"}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0" onClick={e => e.stopPropagation()}>
          <div className="w-28 h-2 bg-muted rounded-full overflow-hidden hidden sm:block">
            <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="text-sm font-bold text-foreground min-w-[52px] text-right">
            {Math.round(sectionCurrent)}<span className="text-muted-foreground font-medium text-xs">/{sectionMax}</span>
          </span>
        </div>
        {isHR && (
          <Button size="sm" onClick={e => { e.stopPropagation(); setOpen(true); setShowAdd(true) }} className="h-8 text-xs gap-1.5 shrink-0 hidden sm:inline-flex">
            <Plus size={12} /> Add KPI
          </Button>
        )}
        <div className={cn("w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted-foreground transition-transform shrink-0", !open && "-rotate-90")}>
          <ChevronDown size={15} />
        </div>
      </button>

      {open && (
        <div className="bg-[#FAFBFC] p-5 flex flex-col gap-4">
          {items.length === 0 && !showAdd ? (
            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center bg-card">
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
                <BarChart3 size={18} />
              </div>
              <p className="font-semibold text-sm">No KPIs in this category</p>
              {isHR && <button type="button" onClick={() => setShowAdd(true)} className="mt-2 text-xs text-primary hover:underline">+ Add the first KPI</button>}
            </div>
          ) : (
            items.map((item, idx) => (
              <KpiCard
                key={item.id} item={item} itemIndex={idx} sectionType={section.type}
                scores={scores} invitees={invitees} isHR={isHR} currentEmployeeId={currentEmployeeId}
                onScoreChange={onScoreChange}
              />
            ))
          )}

          {isHR && showAdd && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
              <p className="text-sm font-semibold">New KPI Item</p>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">KPI Name</label>
                <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Client satisfaction score"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Description</label>
                <textarea rows={2} value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="What does this KPI measure?"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Max Score</label>
                <input type="number" min={1} value={newMax} onChange={e => setNewMax(Number(e.target.value))}
                  className="w-20 rounded-lg border border-border bg-card px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" disabled={!newTitle.trim() || addSaving}
                  onClick={async () => {
                    if (!onAddItem || !newTitle.trim()) return
                    setAddSaving(true)
                    await onAddItem(section.id, { title: newTitle.trim(), description: newDesc, min_score: 0, max_score: newMax })
                    setNewTitle(""); setNewDesc(""); setNewMax(10); setShowAdd(false); setAddSaving(false)
                  }}
                  className="gap-1 h-7 text-xs"
                >
                  {addSaving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} Add KPI
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowAdd(false); setNewTitle(""); setNewDesc("") }} className="h-7 text-xs">Cancel</Button>
              </div>
            </div>
          )}

          {isHR && !showAdd && items.length > 0 && (
            <button type="button" onClick={() => setShowAdd(true)}
              className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-colors"
            >
              <Plus size={13} /> Add KPI Item
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Invitee Panel ──────────────────────────────────────────────────────────────

function InviteePanel({ review, allEmployees, onAddInvitee, onRemoveInvitee }: {
  review: Review; allEmployees: Employee[]
  onAddInvitee: (reviewId: string, ids: string[]) => Promise<void>
  onRemoveInvitee: (reviewId: string, id: string) => Promise<void>
}) {
  const [showPanel, setShowPanel] = useState(false)
  const [selected, setSelected]   = useState<string[]>([])
  const [adding, setAdding]       = useState(false)
  const invitees   = review.kpi_review_invitees ?? []
  const alreadyIds = new Set(invitees.map(i => i.invitee_id))
  const available  = allEmployees.filter(e => !alreadyIds.has(e.id) && e.id !== review.employee_id)

  async function handleAdd() {
    if (!selected.length) return
    setAdding(true)
    await onAddInvitee(review.id, selected)
    setSelected([]); setAdding(false); setShowPanel(false)
  }

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-card border border-border rounded-xl shadow-sm">
        <span className="text-xs font-semibold text-muted-foreground shrink-0">Invitees:</span>
        {invitees.length === 0 && <span className="text-xs text-muted-foreground italic">None assigned yet</span>}
        {invitees.map(inv => (
          <div key={inv.id} className="flex items-center gap-1.5 rounded-full border border-border bg-muted/20 px-2.5 py-1">
            <Avatar name={`${inv.invitee.first_name} ${inv.invitee.last_name}`} size="sm" />
            <span className="text-xs font-medium">{inv.invitee.first_name} {inv.invitee.last_name}</span>
            <InviteeStatusBadge status={inv.status} />
            <button type="button" onClick={() => onRemoveInvitee(review.id, inv.invitee_id)} className="text-muted-foreground hover:text-destructive transition-colors ml-0.5">
              <X size={10} />
            </button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => setShowPanel(o => !o)} className="h-7 text-xs gap-1 ml-auto shrink-0">
          <UserPlus size={12} /> Add Invitee
        </Button>
      </div>
      {showPanel && (
        <div className="mt-2 rounded-xl border border-border bg-card p-4 space-y-3 shadow-sm">
          <p className="text-xs font-semibold text-muted-foreground">Select staff to invite:</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-36 overflow-y-auto">
            {available.map(emp => (
              <button key={emp.id} type="button"
                onClick={() => setSelected(prev => prev.includes(emp.id) ? prev.filter(x => x !== emp.id) : [...prev, emp.id])}
                className={cn("flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs text-left transition-colors",
                  selected.includes(emp.id) ? "border-primary bg-primary/10 text-primary" : "border-border bg-card hover:bg-muted/40")}
              >
                <Avatar name={`${emp.first_name} ${emp.last_name}`} size="sm" />
                {emp.first_name} {emp.last_name}
              </button>
            ))}
            {available.length === 0 && <p className="text-xs text-muted-foreground col-span-3 italic">All employees already invited</p>}
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={!selected.length || adding} className="h-7 text-xs gap-1">
              {adding ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />} Send ({selected.length})
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowPanel(false)} className="h-7 text-xs">Cancel</Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Review Accordion ───────────────────────────────────────────────────────────

function ReviewAccordion({ review, template, scores, allEmployees, currentEmployeeId, isHR, onScoreChange, onAddInvitee, onRemoveInvitee, onStatusChange, onDelete, onAddItem }: {
  review: Review; template: TemplateSection[]; scores: Score[]
  allEmployees: Employee[]; currentEmployeeId: string | null; isHR: boolean
  onScoreChange: (reviewId: string, itemId: string, score: number | null, comments: string) => Promise<void>
  onAddInvitee: (reviewId: string, ids: string[]) => Promise<void>
  onRemoveInvitee: (reviewId: string, id: string) => Promise<void>
  onStatusChange: (reviewId: string, status: string) => Promise<void>
  onDelete: (reviewId: string) => void
  onAddItem?: (sectionId: string, data: { title: string; description: string; min_score: number; max_score: number }) => Promise<void>
}) {
  const [open, setOpen]   = useState(false)
  const emp               = review.employee
  const invitees          = review.kpi_review_invitees ?? []
  const completedCnt      = invitees.filter(i => i.status === "completed").length

  const overallMax = template.reduce((a, s) => a + s.kpi_template_items.reduce((b, i) => b + i.max_score, 0), 0)
  const scoreMap = new Map<string, Score>()
  for (const s of scores) scoreMap.set(`${s.item_id}::${s.scorer_id ?? "hr"}`, s)
  const overallCurrent = template.reduce((total, section) => {
    const items = section.kpi_template_items ?? []
    if (section.type === "hr") return total + items.reduce((a, item) => a + (scoreMap.get(`${item.id}::hr`)?.score ?? 0), 0)
    const invIds = [...new Set(scores.filter(s => s.scorer_id !== null).map(s => s.scorer_id!))]
    if (invIds.length === 0) return total
    return total + items.reduce((a, item) => {
      const vals = invIds.map(id => scoreMap.get(`${item.id}::${id}`)?.score).filter((v): v is number => v != null)
      return a + (vals.length > 0 ? vals.reduce((x, y) => x + y, 0) / vals.length : 0)
    }, 0)
  }, 0)

  return (
    <div className={cn("rounded-2xl border bg-card overflow-hidden transition-all", open ? "border-border shadow-lg" : "border-border shadow-sm")}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className={cn("w-full flex items-center justify-between px-5 py-4 text-left transition-colors", open ? "border-b border-border" : "hover:bg-muted/20")}
      >
        <div className="flex items-center gap-3">
          <Avatar name={`${emp.first_name} ${emp.last_name}`} size="lg" />
          <div>
            <p className="font-bold text-base">{emp.first_name} {emp.last_name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {emp.job_title} · {emp.department?.name ?? "—"} · {review.period}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize", REVIEW_STATUS_CLS[review.status])}>
            {review.status}
          </span>
          {invitees.length > 0 && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Users size={12} /> {completedCnt}/{invitees.length}
            </span>
          )}
          {review.deadline && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock size={12} />
              {new Date(review.deadline).toLocaleDateString("en-ZA", { day: "2-digit", month: "short" })}
            </span>
          )}
          <div className={cn("w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted-foreground transition-transform", !open && "-rotate-90")}>
            <ChevronDown size={15} />
          </div>
        </div>
      </button>

      {open && (
        <div className="px-5 py-5 space-y-4">
          {isHR && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Status:</span>
                <select value={review.status} onChange={e => onStatusChange(review.id, e.target.value)}
                  className="text-xs rounded-lg border border-border bg-card px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <button type="button" onClick={() => onDelete(review.id)} className="flex items-center gap-1 text-xs text-destructive hover:opacity-70 transition-opacity">
                <Trash2 size={12} /> Delete review
              </button>
            </div>
          )}

          {/* Context strip */}
          <div className="flex flex-wrap items-center gap-4 bg-card border border-border rounded-xl px-4 py-3 shadow-sm">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Avatar name={`${emp.first_name} ${emp.last_name}`} size="lg" />
              <div className="min-w-0">
                <div className="font-semibold text-sm">{emp.first_name} {emp.last_name}</div>
                <div className="text-xs text-muted-foreground">{emp.job_title} · {emp.department?.name ?? "—"}</div>
              </div>
            </div>
            <div className="hidden sm:block w-px h-9 bg-border" />
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Cycle</span>
              <span className="text-sm font-bold">{review.period}</span>
            </div>
            {overallMax > 0 && (
              <>
                <div className="hidden sm:block w-px h-9 bg-border" />
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Overall</span>
                  <span className="text-sm font-bold">{Math.round(overallCurrent)}<span className="text-muted-foreground font-medium text-xs"> / {overallMax}</span></span>
                </div>
              </>
            )}
            {review.deadline && (
              <>
                <div className="hidden sm:block w-px h-9 bg-border" />
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Deadline</span>
                  <span className="text-sm font-bold">{new Date(review.deadline).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })}</span>
                </div>
              </>
            )}
            <div className="hidden sm:block w-px h-9 bg-border" />
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Status</span>
              <span className={cn("inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border capitalize", REVIEW_STATUS_CLS[review.status])}>
                {review.status}
              </span>
            </div>
          </div>

          {isHR && (
            <InviteePanel review={review} allEmployees={allEmployees} onAddInvitee={onAddInvitee} onRemoveInvitee={onRemoveInvitee} />
          )}

          <div className="flex flex-col gap-3">
            {template.length === 0
              ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
                  <BarChart3 size={32} className="opacity-30" />
                  <p className="text-sm">No KPI template configured yet.</p>
                </div>
              )
              : template.map((section, idx) => (
                  <SectionAccordion
                    key={section.id} section={section} sectionIndex={idx}
                    scores={scores} invitees={review.kpi_review_invitees ?? []}
                    isHR={isHR} currentEmployeeId={currentEmployeeId}
                    onScoreChange={(itemId, score, comments) => onScoreChange(review.id, itemId, score, comments)}
                    onAddItem={onAddItem} defaultOpen={idx === 0}
                  />
                ))
            }
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Create Review Modal ────────────────────────────────────────────────────────

function CreateReviewModal({ employees, currentPeriod, onSave, onClose, saving }: {
  employees: Employee[]; currentPeriod: string
  onSave: (d: { employee_id: string; period: string; title: string; deadline: string }) => Promise<void>
  onClose: () => void; saving: boolean
}) {
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "")
  const [period, setPeriod]         = useState(currentPeriod)
  const [title, setTitle]           = useState(`${currentPeriod} Performance Review`)
  const [deadline, setDeadline]     = useState("")

  useEffect(() => {
    const sel = employees.find(e => e.id === employeeId)
    if (sel) setTitle(`${sel.first_name} ${sel.last_name} — ${period} Review`)
  }, [employeeId, period, employees])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-card border border-border p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">Create KPI Review</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Employee</label>
            <select value={employeeId} onChange={e => setEmployeeId(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {employees.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Period</label>
            <input value={period} onChange={e => setPeriod(e.target.value)} placeholder="e.g. Q1 2026"
              className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Scoring Deadline</label>
            <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <Button className="flex-1" onClick={() => onSave({ employee_id: employeeId, period, title, deadline })} disabled={saving || !employeeId || !period || !title}>
            {saving ? <Loader2 size={14} className="animate-spin mr-2" /> : null} Create Review
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

type Tab = "reviews" | "myassignments"

export function KpiPageClient({ isHR, currentEmployeeId }: { isHR: boolean; currentEmployeeId: string | null }) {
  const [tab, setTab]                     = useState<Tab>(isHR ? "reviews" : "myassignments")
  const [template, setTemplate]           = useState<TemplateSection[]>([])
  const [reviews, setReviews]             = useState<Review[]>([])
  const [scores, setScores]               = useState<Record<string, Score[]>>({})
  const [allEmployees, setAllEmployees]   = useState<Employee[]>([])
  const [loading, setLoading]             = useState(true)
  const [showCreate, setShowCreate]       = useState(false)
  const [creating, setCreating]           = useState(false)
  const [currentPeriod, setCurrentPeriod] = useState("Q2 2026")
  const [filterPeriod, setFilterPeriod]   = useState("all")
  const [toast, setToast]                 = useState<string | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const loadAll = useCallback(async () => {
    setLoading(true)
    const [tRes, rRes, eRes, settRes] = await Promise.all([
      fetch("/api/kpi/template"),
      fetch("/api/kpi/reviews"),
      isHR ? fetch("/api/employees/active") : Promise.resolve(null),
      isHR ? fetch("/api/kpi/settings") : Promise.resolve(null),
    ])
    const [tData, rData, eData, settData] = await Promise.all([
      tRes.ok ? tRes.json() : [],
      rRes.ok ? rRes.json() : [],
      eRes?.ok ? eRes!.json() : [],
      settRes?.ok ? settRes!.json() : null,
    ])

    setTemplate(tData)
    setReviews(Array.isArray(rData) ? rData : [])
    setAllEmployees(Array.isArray(eData) ? eData : [])
    if (settData?.current_period) setCurrentPeriod(settData.current_period)
    setLoading(false)
  }, [isHR])

  useEffect(() => { loadAll() }, [loadAll])

  useEffect(() => {
    reviews.forEach(async (r) => {
      if (scores[r.id] !== undefined) return
      const res = await fetch(`/api/kpi/reviews/${r.id}/scores`)
      if (res.ok) {
        const data = await res.json()
        setScores(prev => ({ ...prev, [r.id]: data }))
      }
    })
  }, [reviews]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleScoreChange(reviewId: string, itemId: string, score: number | null, comments: string) {
    const res = await fetch(`/api/kpi/reviews/${reviewId}/scores`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: itemId, score, comments }),
    })
    if (res.ok) {
      const updated: Score = await res.json()
      setScores(prev => {
        const list = (prev[reviewId] ?? []).filter(s => !(s.item_id === itemId && s.scorer_id === updated.scorer_id))
        return { ...prev, [reviewId]: [...list, updated] }
      })
    } else {
      showToast("Failed to save score")
    }
  }

  async function handleAddInvitee(reviewId: string, inviteeIds: string[]) {
    const res = await fetch(`/api/kpi/reviews/${reviewId}/invitees`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitee_ids: inviteeIds }),
    })
    if (res.ok) { showToast("Invitations sent"); await loadAll() }
    else showToast("Failed to send invitations")
  }

  async function handleRemoveInvitee(reviewId: string, inviteeId: string) {
    await fetch(`/api/kpi/reviews/${reviewId}/invitees`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitee_id: inviteeId }),
    })
    await loadAll()
  }

  async function handleStatusChange(reviewId: string, status: string) {
    await fetch(`/api/kpi/reviews/${reviewId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, status: status as Review["status"] } : r))
  }

  async function handleDeleteReview(reviewId: string) {
    if (!confirm("Delete this KPI review? This cannot be undone.")) return
    await fetch(`/api/kpi/reviews/${reviewId}`, { method: "DELETE" })
    setReviews(prev => prev.filter(r => r.id !== reviewId))
    showToast("Review deleted")
  }

  async function handleAddItem(sectionId: string, data: { title: string; description: string; min_score: number; max_score: number }) {
    const res = await fetch(`/api/kpi/template/sections/${sectionId}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (res.ok) { showToast("KPI item added"); await loadAll() }
    else showToast("Failed to add KPI item")
  }

  async function handleCreate(d: { employee_id: string; period: string; title: string; deadline: string }) {
    setCreating(true)
    const res = await fetch("/api/kpi/reviews", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(d),
    })
    if (res.ok) { showToast("Review created"); setShowCreate(false); await loadAll() }
    else { const err = await res.json(); showToast(err.error ?? "Failed to create review") }
    setCreating(false)
  }

  const myAssignments = isHR
    ? reviews.filter(r => r.kpi_review_invitees?.some(i => i.invitee_id === currentEmployeeId))
    : reviews

  const periods = ["all", ...Array.from(new Set(reviews.map(r => r.period)))]
  const filteredReviews = filterPeriod === "all" ? reviews : reviews.filter(r => r.period === filterPeriod)

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    ...(isHR ? [{ id: "reviews" as Tab, label: "All Reviews", icon: BarChart3 }] : []),
    { id: "myassignments" as Tab, label: isHR ? "My Assignments" : "My Reviews", icon: FileText },
  ]

  return (
    <div className="space-y-0">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-foreground text-background text-sm px-4 py-2.5 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-start justify-between gap-4 mb-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">KPI &amp; Performance</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isHR ? "Manage performance reviews and scoring" : "View your KPI reviews and scoring"}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mt-6 mb-6 border-b border-border">
        {tabs.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              className={cn("flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors",
                tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
            >
              <Icon size={15} /> {t.label}
            </button>
          )
        })}
        <div className="ml-auto flex items-center gap-2 pb-1">
          {isHR && tab === "reviews" && (
            <>
              <select value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)}
                className="text-xs rounded-xl border border-border bg-card px-2.5 py-1.5 focus:outline-none"
              >
                {periods.map(p => <option key={p} value={p}>{p === "all" ? "All periods" : p}</option>)}
              </select>
              <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5 h-8 text-xs">
                <Plus size={13} /> New Review
              </Button>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 size={28} className="animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {tab === "reviews" && isHR && (
            <div className="space-y-4">
              {filteredReviews.length === 0
                ? (
                  <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
                    <BarChart3 size={36} className="opacity-30" />
                    <p className="text-sm">No reviews yet. Click <strong>New Review</strong> to get started.</p>
                  </div>
                )
                : filteredReviews.map(review => (
                    <ReviewAccordion
                      key={review.id} review={review} template={template} scores={scores[review.id] ?? []}
                      allEmployees={allEmployees} currentEmployeeId={currentEmployeeId} isHR={isHR}
                      onScoreChange={handleScoreChange} onAddInvitee={handleAddInvitee}
                      onRemoveInvitee={handleRemoveInvitee} onStatusChange={handleStatusChange}
                      onDelete={handleDeleteReview} onAddItem={handleAddItem}
                    />
                  ))
              }
            </div>
          )}

          {tab === "myassignments" && (
            <div className="space-y-4">
              {myAssignments.length === 0
                ? (
                  <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
                    <FileText size={36} className="opacity-30" />
                    <p className="text-sm">{isHR ? "You have no pending scoring assignments." : "No KPI reviews found yet."}</p>
                  </div>
                )
                : myAssignments.map(review => {
                    const myInv = review.kpi_review_invitees.find(i => i.invitee_id === currentEmployeeId)
                    return (
                      <div key={review.id} className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
                        <div className="px-5 py-4 flex items-center justify-between border-b border-border gap-4">
                          <div className="min-w-0">
                            <p className="font-bold text-base leading-snug">{review.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {review.employee.first_name} {review.employee.last_name} · {review.period}
                              {review.deadline && ` · Due ${new Date(review.deadline).toLocaleDateString("en-ZA", { dateStyle: "medium" })}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {myInv && <InviteeStatusBadge status={myInv.status} />}
                            {myInv?.status === "pending" && (
                              <>
                                <Button size="sm" className="h-7 text-xs gap-1"
                                  onClick={async () => {
                                    await fetch(`/api/kpi/invitees/${myInv.id}/respond`, {
                                      method: "POST", headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ response: "accepted" }),
                                    })
                                    showToast("Invitation accepted"); await loadAll()
                                  }}
                                >
                                  <Check size={11} /> Accept
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive border-destructive/40 hover:bg-destructive/10"
                                  onClick={async () => {
                                    await fetch(`/api/kpi/invitees/${myInv.id}/respond`, {
                                      method: "POST", headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ response: "declined" }),
                                    })
                                    showToast("Invitation declined"); await loadAll()
                                  }}
                                >
                                  <X size={11} /> Decline
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                        {myInv && (myInv.status === "accepted" || myInv.status === "completed") && (
                          <div className="px-5 py-5 space-y-3">
                            {template.map((section, idx) => (
                              <SectionAccordion
                                key={section.id} section={section} sectionIndex={idx}
                                scores={scores[review.id] ?? []} invitees={review.kpi_review_invitees ?? []}
                                isHR={false} currentEmployeeId={currentEmployeeId}
                                onScoreChange={(itemId, score, comments) => handleScoreChange(review.id, itemId, score, comments)}
                                defaultOpen={idx === 0}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })
              }
            </div>
          )}
        </>
      )}

      {showCreate && (
        <CreateReviewModal
          employees={allEmployees} currentPeriod={currentPeriod}
          onSave={handleCreate} onClose={() => setShowCreate(false)} saving={creating}
        />
      )}
    </div>
  )
}
