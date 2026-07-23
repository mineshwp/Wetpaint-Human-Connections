"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import {
  ChevronDown, ChevronRight, ChevronLeft, Plus, Trash2, X, Check,
  Users, UserPlus, Send, Clock, CheckCircle2, XCircle,
  Loader2, BarChart3, FileText, Target, Heart, Building2,
  Upload, Search, Pencil, SlidersHorizontal, ArrowUp, ArrowDown, Download, FileSpreadsheet, RotateCcw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// ─── Types ─────────────────────────────────────────────────────────────────────

interface TemplateItem {
  id: string; section_id: string; title: string; description: string | null
  min_score: number; max_score: number; position: number; is_active: boolean
  _custom?: boolean; _overridden?: boolean
}
interface TemplateSection {
  id: string; title: string; type: "invitee" | "hr"
  position: number; is_active: boolean
  kpi_template_items: TemplateItem[]
}
interface ReviewInvitee {
  id: string; invitee_id: string; status: "pending" | "accepted" | "declined" | "completed"
  invitee: { id: string; first_name: string; last_name: string }
  kpi_review_invitee_sections?: { section_id: string }[]
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
interface FinalComment {
  id: string; review_id: string; author_id: string | null; comment: string | null
}
interface Employee {
  id: string; first_name: string; last_name: string; job_title: string; email?: string
  department?: { name: string } | null
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

const INVITEE_STATUS: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  pending:   { label: "Pending",   cls: "bg-amber-50 text-amber-700 border-amber-200",       icon: Clock        },
  accepted:  { label: "Accepted",  cls: "bg-blue-50 text-blue-700 border-blue-200",          icon: CheckCircle2 },
  declined:  { label: "Declined",  cls: "bg-red-50 text-red-700 border-red-200",             icon: XCircle      },
  completed: { label: "Completed", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
}

const AVATAR_COLORS = [
  "#3B82F6","#10B981","#F59E0B","#8B5CF6","#EC4899","#14B8A6","#F97316","#6366F1",
]

// Show whole numbers plainly and half-points with one decimal (e.g. 9, 6.5).
const fmtScore = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(1))

// Active reviewers (accepted/completed) assigned to a given section.
function assignedReviewers(invitees: ReviewInvitee[], sectionId: string): ReviewInvitee[] {
  return invitees.filter(
    i =>
      (i.status === "accepted" || i.status === "completed") &&
      (i.kpi_review_invitee_sections ?? []).some(s => s.section_id === sectionId)
  )
}

// Section styling config
const SECTION_CONFIG: Record<number, { icon: React.ElementType; colorClass: string; label: string }> = {
  1: { icon: Target,    colorClass: "text-blue-600",  label: "KPI Focus Areas: Personal & Department" },
  2: { icon: Heart,     colorClass: "text-pink-500",  label: "Our Values: Tribe Contract" },
  3: { icon: Building2, colorClass: "text-amber-600", label: "HR Areas: Tribe Contract" },
}

// Status display mapping: DB value → display label
const STATUS_DISPLAY: Record<string, { label: string; chipCls: string }> = {
  draft:     { label: "Draft",     chipCls: "bg-amber-50 text-amber-700 border-amber-200" },
  active:    { label: "Published", chipCls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  completed: { label: "Completed", chipCls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
}

// Quarter helpers
const QUARTERS = [1, 2, 3, 4] as const
type Quarter = typeof QUARTERS[number]

const QUARTER_LABELS: Record<Quarter, string> = {
  1: "Q1 · Jan–Mar", 2: "Q2 · Apr–Jun", 3: "Q3 · Jul–Sep", 4: "Q4 · Oct–Dec"
}

function periodToQuarter(period: string): Quarter | null {
  // "Q1 2026", "Quarter 1 - 2026", "Quarter 1 2026"
  const m = period.match(/[Qq](?:uarter\s*)?(\d)/i)
  if (m) return parseInt(m[1]) as Quarter
  return null
}

function quarterToPeriod(q: Quarter): string {
  return `Q${q} 2026`
}

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
      <div className="grid items-start gap-x-2 px-3 py-2.5" style={{ gridTemplateColumns: "minmax(120px,1fr) 64px minmax(100px,2fr) 20px" }}>
        <div className="flex items-center gap-2 min-w-0 pt-0.5">
          <Avatar name={name} size="sm" />
          <div className="min-w-0">
            <div className="text-xs font-semibold truncate">{name}</div>
            <div className="text-[10px] text-muted-foreground">{role}</div>
          </div>
        </div>
        {canEdit && editing ? (
          <input
            type="number" min={item.min_score} max={item.max_score} step={0.5}
            value={val} onChange={e => setVal(e.target.value)} autoFocus
            className="w-full border border-primary rounded-md px-1.5 py-1 text-sm font-bold text-center bg-primary/5 text-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        ) : canEdit ? (
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
        ) : (
          <div className="text-sm font-bold text-center pt-1">
            {hasScore ? scoreObj!.score : <span className="text-muted-foreground">—</span>}
          </div>
        )}
        {canEdit && editing ? (
          <textarea
            rows={2} value={comm} onChange={e => setComm(e.target.value)}
            placeholder="Add a comment or evidence…"
            className="w-full border border-border rounded-lg px-2 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary bg-card"
          />
        ) : (
          <div
            onClick={canEdit ? () => setEditing(true) : undefined}
            className={cn("text-xs leading-relaxed pt-0.5", canEdit && "cursor-pointer")}
          >
            {scoreObj?.comments
              ? <span className="text-foreground">{scoreObj.comments}</span>
              : <span className="text-muted-foreground italic">{canEdit ? "Click to add…" : "—"}</span>
            }
          </div>
        )}
        <div className="flex justify-center pt-2">
          <div className={cn("w-2 h-2 rounded-full shrink-0", hasScore ? "bg-emerald-500" : "bg-amber-300")} />
        </div>
      </div>
      {editing && canEdit && (
        <div className="px-3 pb-3 flex gap-2">
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
      )}
    </div>
  )
}

// ─── KPI Card ───────────────────────────────────────────────────────────────────

function KpiCard({ item, itemIndex, sectionType, scores, invitees, isHR, currentEmployeeId, onScoreChange, onEditItem, onDeleteItem, onResetItem }: {
  item: TemplateItem; itemIndex: number; sectionType: "invitee" | "hr"
  scores: Score[]; invitees: ReviewInvitee[]; isHR: boolean; currentEmployeeId: string | null
  onScoreChange: (itemId: string, score: number | null, comments: string, scorerId: string | null) => Promise<void>
  onEditItem?: (itemId: string, data: { title: string; description: string; min_score: number; max_score: number }) => Promise<void>
  onDeleteItem?: (itemId: string, title: string) => void
  onResetItem?: (itemId: string) => void
}) {
  const [editMode, setEditMode]     = useState(false)
  const [editTitle, setEditTitle]   = useState(item.title)
  const [editDesc, setEditDesc]     = useState(item.description ?? "")
  const [editMin, setEditMin]       = useState(item.min_score)
  const [editMax, setEditMax]       = useState(item.max_score)
  const [editSaving, setEditSaving] = useState(false)

  const scoreMap = new Map<string, Score>()
  for (const s of scores) scoreMap.set(`${s.item_id}::${s.scorer_id ?? "hr"}`, s)

  // Only reviewers assigned to this item's section can score it. An HR/Admin
  // row (scorer_id null) is also shown for HR sections and wherever an
  // HR/Admin score already exists (preserves historical/imported data).
  const reviewers = assignedReviewers(invitees, item.section_id)
  const hrScoreObj = scoreMap.get(`${item.id}::hr`)
  const showHrRow = sectionType === "hr" || hrScoreObj !== undefined

  const numericScores: number[] = []
  if (hrScoreObj?.score != null) numericScores.push(hrScoreObj.score)
  for (const inv of reviewers) {
    const v = scoreMap.get(`${item.id}::${inv.invitee_id}`)?.score
    if (v != null) numericScores.push(v)
  }
  const avgScore = numericScores.length > 0
    ? numericScores.reduce((a, b) => a + b, 0) / numericScores.length
    : null

  const scorerRows: { key: string; name: string; role: string; scoreObj: Score | undefined; canEdit: boolean; scorerId: string | null }[] = []
  if (showHrRow) {
    scorerRows.push({ key: "hr", name: "HR / Admin", role: "HR", scoreObj: hrScoreObj, canEdit: isHR, scorerId: null })
  }
  for (const inv of reviewers) {
    scorerRows.push({
      key: inv.invitee_id,
      name: `${inv.invitee.first_name} ${inv.invitee.last_name}`,
      role: "Reviewer",
      scoreObj: scoreMap.get(`${item.id}::${inv.invitee_id}`),
      // HR can enter/edit any reviewer's score (backdated entry); a reviewer
      // scoring live can edit only their own row.
      canEdit: isHR || inv.invitee_id === currentEmployeeId,
      scorerId: inv.invitee_id,
    })
  }

  async function handleEditSave() {
    if (!onEditItem || !editTitle.trim()) return
    // Editing a global KPI here creates an override for THIS staff only.
    if (!item._custom && !window.confirm(
      "This change applies to this staff member's review only — not the global template. Continue?"
    )) return
    setEditSaving(true)
    await onEditItem(item.id, { title: editTitle.trim(), description: editDesc, min_score: editMin, max_score: editMax })
    setEditSaving(false)
    setEditMode(false)
  }

  return (
    <article className="border border-border rounded-xl overflow-hidden bg-card transition-shadow hover:shadow-sm">
      <div className="flex justify-between items-start px-5 py-4 bg-muted/20 border-b border-border gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              KPI {itemIndex + 1} · Max {editMode ? editMax : item.max_score}
            </span>
            {item._custom && (
              <span className="text-[9px] font-bold uppercase tracking-wider rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5">This staff only</span>
            )}
            {item._overridden && !item._custom && (
              <span className="text-[9px] font-bold uppercase tracking-wider rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5">Edited for this staff</span>
            )}
          </div>
          {editMode ? (
            <input
              autoFocus
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              className="w-full rounded-lg border border-primary bg-card px-3 py-1.5 text-[15px] font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
            />
          ) : (
            <h3 className="font-semibold text-[15px] text-foreground leading-snug">{item.title}</h3>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isHR && !editMode && (
            <button
              type="button"
              onClick={() => { setEditTitle(item.title); setEditDesc(item.description ?? ""); setEditMin(item.min_score); setEditMax(item.max_score); setEditMode(true) }}
              className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/60 transition-colors"
            >
              <Pencil size={12} />
            </button>
          )}
          {avgScore !== null && !editMode && (
            <div className="text-right">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Avg Score</div>
              <div className="text-2xl font-bold leading-none text-foreground">
                {avgScore % 1 === 0 ? avgScore : avgScore.toFixed(1)}
                <span className="text-muted-foreground font-medium text-sm"> / {item.max_score}</span>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 divide-border">
        <div className="px-5 py-4 space-y-3">
          <div>
            <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Description</h4>
            {editMode ? (
              <textarea
                rows={5}
                value={editDesc}
                onChange={e => setEditDesc(e.target.value)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              />
            ) : item.description ? (
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{item.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">No description provided.</p>
            )}
          </div>
          {editMode && (
            <div className="space-y-3">
              <div className="flex gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Min Score</label>
                  <input
                    type="number" min={0} value={editMin}
                    onChange={e => setEditMin(Number(e.target.value))}
                    className="w-24 rounded-lg border border-border bg-card px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Max Score</label>
                  <input
                    type="number" min={1} value={editMax}
                    onChange={e => setEditMax(Number(e.target.value))}
                    className="w-24 rounded-lg border border-border bg-card px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" onClick={handleEditSave} disabled={!editTitle.trim() || editSaving} className="h-7 text-xs gap-1">
                  {editSaving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditMode(false)} className="h-7 text-xs">Cancel</Button>
                <div className="ml-auto flex items-center gap-2">
                  {onResetItem && (item._overridden || item._custom) && (
                    <button
                      type="button"
                      onClick={() => onResetItem(item.id)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1.5 rounded-lg border border-border hover:border-primary/60"
                    >
                      <RotateCcw size={11} /> {item._custom ? "Remove (custom)" : "Reset to template"}
                    </button>
                  )}
                  {onDeleteItem && !item._custom && (
                    <button
                      type="button"
                      onClick={() => onDeleteItem(item.id, item.title)}
                      className="flex items-center gap-1 text-xs text-destructive hover:opacity-70 transition-opacity px-2 py-1.5 rounded-lg border border-destructive/30 hover:bg-destructive/5"
                    >
                      <Trash2 size={11} /> Remove for this staff
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="px-5 pb-4 space-y-3">
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Scoring</h4>
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="grid items-center gap-x-2 px-3 py-2 bg-muted/30 border-b border-border" style={{ gridTemplateColumns: "minmax(120px,1fr) 64px minmax(100px,2fr) 20px" }}>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Person</span>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Score</span>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Comment</span>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">✓</span>
            </div>
            {scorerRows.length === 0
              ? <div className="px-3 py-4 text-xs text-muted-foreground text-center italic">No reviewers assigned to this section.</div>
              : scorerRows.map(row => (
                  <ScorerRow
                    key={row.key} name={row.name} role={row.role}
                    scoreObj={row.scoreObj} canEdit={row.canEdit} item={item}
                    onSave={(score, comm) => onScoreChange(item.id, score, comm, row.scorerId)}
                  />
                ))
            }
            <div className="px-3 py-2.5 border-t border-dashed border-border bg-muted/10 flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">
                Final score is the average of all submitted scores
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

function SectionAccordion({ section, sectionIndex, scores, invitees, isHR, currentEmployeeId, onScoreChange, onAddItem, onEditItem, onDeleteItem, onResetItem, defaultOpen }: {
  section: TemplateSection; sectionIndex: number; scores: Score[]; invitees: ReviewInvitee[]
  isHR: boolean; currentEmployeeId: string | null
  onScoreChange: (itemId: string, score: number | null, comments: string, scorerId: string | null) => Promise<void>
  onAddItem?: (sectionId: string, data: { title: string; description: string; min_score: number; max_score: number }) => Promise<void>
  onEditItem?: (itemId: string, data: { title: string; description: string; min_score: number; max_score: number }) => Promise<void>
  onDeleteItem?: (itemId: string, title: string) => void
  onResetItem?: (itemId: string) => void
  defaultOpen?: boolean
}) {
  const [open, setOpen]           = useState(defaultOpen ?? sectionIndex === 0)
  const [showAdd, setShowAdd]     = useState(false)
  const [newTitle, setNewTitle]   = useState("")
  const [newDesc, setNewDesc]     = useState("")
  const [newMax, setNewMax]       = useState(10)
  const [addSaving, setAddSaving] = useState(false)

  const items = section.kpi_template_items ?? []
  const sectionMax = items.reduce((a, i) => a + i.max_score, 0)
  const scoreMap = new Map<string, Score>()
  for (const s of scores) scoreMap.set(`${s.item_id}::${s.scorer_id ?? "hr"}`, s)

  // Reviewers assigned to this section score every item in it. An HR/Admin
  // score (scorer_id null) also counts where present or on HR sections.
  const reviewers = assignedReviewers(invitees, section.id)
  const sectionHasHr = section.type === "hr" || items.some(i => scoreMap.get(`${i.id}::hr`) !== undefined)

  const sectionCurrent = items.reduce((total, item) => {
    const vals: number[] = []
    const hrv = scoreMap.get(`${item.id}::hr`)?.score
    if (hrv != null) vals.push(hrv)
    for (const inv of reviewers) {
      const v = scoreMap.get(`${item.id}::${inv.invitee_id}`)?.score
      if (v != null) vals.push(v)
    }
    if (vals.length === 0) return total
    return total + vals.reduce((a, b) => a + b, 0) / vals.length
  }, 0)

  const progressPct = sectionMax > 0 ? Math.min(100, (sectionCurrent / sectionMax) * 100) : 0
  const cfg = SECTION_CONFIG[section.position] ?? { icon: BarChart3, colorClass: "text-primary", label: section.title }
  const SectionIcon = cfg.icon
  const sectionLabel = section.title?.trim() ? section.title : cfg.label

  const scorerNames = [
    ...(sectionHasHr ? ["HR / Admin"] : []),
    ...reviewers.map(i => i.invitee.first_name),
  ].join(", ")

  return (
    <div className={cn("rounded-xl border bg-card overflow-hidden transition-all", open ? "border-border shadow-md" : "border-border shadow-sm")}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            setOpen(o => !o)
          }
        }}
        className={cn("w-full flex items-center gap-3 px-5 py-4 text-left transition-colors cursor-pointer select-none", open ? "border-b border-border" : "hover:bg-muted/20")}
      >
        <SectionIcon size={18} className={cn("shrink-0", cfg.colorClass)} />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-[14px] text-foreground leading-snug">{sectionLabel}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {items.length} item{items.length !== 1 ? "s" : ""} · max {sectionMax} pts
            {scorerNames ? ` · ${scorerNames}` : " · No reviewers assigned"}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0" onClick={e => e.stopPropagation()}>
          <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden hidden sm:block">
            <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="text-sm font-bold text-foreground min-w-[52px] text-right">
            {fmtScore(sectionCurrent)}<span className="text-muted-foreground font-medium text-xs">/{sectionMax}</span>
          </span>
        </div>
        {isHR && (
          <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); setOpen(true); setShowAdd(true) }} className="h-7 text-xs gap-1.5 shrink-0 hidden sm:inline-flex">
            <Plus size={11} /> Add KPI (this staff)
          </Button>
        )}
        <div className={cn("w-7 h-7 rounded-full border border-border flex items-center justify-center text-muted-foreground transition-transform shrink-0", !open && "-rotate-90")}>
          <ChevronDown size={14} />
        </div>
      </div>

      {open && (
        <div className="bg-[#FAFBFC] p-5 flex flex-col gap-4">
          {items.length === 0 && !showAdd ? (
            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center bg-card">
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
                <BarChart3 size={18} />
              </div>
              <p className="font-semibold text-sm">No KPIs in this section for this staff member</p>
              {isHR && <button type="button" onClick={() => setShowAdd(true)} className="mt-2 text-xs text-primary hover:underline">+ Add a KPI for this staff member</button>}
            </div>
          ) : (
            items.map((item, idx) => (
              <KpiCard
                key={item.id} item={item} itemIndex={idx} sectionType={section.type}
                scores={scores} invitees={invitees} isHR={isHR} currentEmployeeId={currentEmployeeId}
                onScoreChange={onScoreChange} onEditItem={onEditItem} onDeleteItem={onDeleteItem} onResetItem={onResetItem}
              />
            ))
          )}

          {isHR && showAdd && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
              <p className="text-sm font-semibold">New KPI — this staff member only</p>
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
              <Plus size={13} /> Add KPI (this staff member only)
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Invitee Panel ──────────────────────────────────────────────────────────────

function InviteePanel({ review, allEmployees, template, onAddInvitee, onRemoveInvitee, onSetSections }: {
  review: Review; allEmployees: Employee[]; template: TemplateSection[]
  onAddInvitee: (reviewId: string, ids: string[], sendEmail: boolean, sectionIds: string[]) => Promise<void>
  onSetSections: (reviewId: string, reviewInviteeId: string, sectionIds: string[]) => Promise<void>
  onRemoveInvitee: (reviewId: string, id: string) => Promise<void>
}) {
  const [showPanel, setShowPanel] = useState(false)
  const [selected, setSelected]   = useState<string[]>([])
  const [adding, setAdding]       = useState(false)
  const [sendEmail, setSendEmail] = useState(false)
  const [addSections, setAddSections] = useState<string[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editSections, setEditSections] = useState<string[]>([])
  const [savingSections, setSavingSections] = useState(false)

  const invitees   = review.kpi_review_invitees ?? []
  const alreadyIds = new Set(invitees.map(i => i.invitee_id))
  const available  = allEmployees.filter(e => !alreadyIds.has(e.id) && e.id !== review.employee_id)
  const sections   = [...template].sort((a, b) => a.position - b.position)
  const secName    = (s: TemplateSection) => (s.title?.trim() ? s.title : SECTION_CONFIG[s.position]?.label ?? "Section")

  function toggle(list: string[], id: string) {
    return list.includes(id) ? list.filter(x => x !== id) : [...list, id]
  }

  async function handleAdd() {
    if (!selected.length) return
    setAdding(true)
    await onAddInvitee(review.id, selected, sendEmail, addSections)
    setSelected([]); setAddSections([]); setAdding(false); setShowPanel(false)
  }

  async function handleSaveSections(reviewInviteeId: string) {
    setSavingSections(true)
    await onSetSections(review.id, reviewInviteeId, editSections)
    setSavingSections(false)
    setEditingId(null)
  }

  return (
    <div className="mb-4 space-y-2">
      <div className="px-4 py-3 bg-card border border-border rounded-xl shadow-sm space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">Reviewers</span>
          <Button size="sm" variant="outline" onClick={() => setShowPanel(o => !o)} className="h-7 text-xs gap-1 ml-auto shrink-0">
            <UserPlus size={12} /> Add reviewer
          </Button>
        </div>
        {invitees.length === 0 && <p className="text-xs text-muted-foreground italic">None added yet</p>}
        {invitees.map(inv => {
          const assigned = (inv.kpi_review_invitee_sections ?? []).map(s => s.section_id)
          const isEditing = editingId === inv.id
          return (
            <div key={inv.id} className="rounded-lg border border-border bg-muted/10 px-3 py-2">
              <div className="flex items-center gap-2">
                <Avatar name={`${inv.invitee.first_name} ${inv.invitee.last_name}`} size="sm" />
                <span className="text-xs font-medium">{inv.invitee.first_name} {inv.invitee.last_name}</span>
                <InviteeStatusBadge status={inv.status} />
                <span className="text-[10px] text-muted-foreground">
                  {assigned.length} section{assigned.length !== 1 ? "s" : ""}
                </span>
                <button
                  type="button"
                  onClick={() => { setEditingId(isEditing ? null : inv.id); setEditSections(assigned) }}
                  className="ml-auto text-[11px] text-primary hover:underline"
                >
                  {isEditing ? "Close" : "Sections"}
                </button>
                <button type="button" onClick={() => onRemoveInvitee(review.id, inv.invitee_id)} className="text-muted-foreground hover:text-destructive transition-colors">
                  <X size={12} />
                </button>
              </div>
              {isEditing && (
                <div className="mt-2 pt-2 border-t border-border space-y-2">
                  <p className="text-[11px] font-semibold text-muted-foreground">Sections this reviewer may score:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {sections.map(s => (
                      <label key={s.id} className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 cursor-pointer">
                        <input type="checkbox" checked={editSections.includes(s.id)}
                          onChange={() => setEditSections(prev => toggle(prev, s.id))}
                          className="h-3.5 w-3.5 rounded border-border accent-primary shrink-0" />
                        <span className="text-xs truncate">{secName(s)}</span>
                      </label>
                    ))}
                    {sections.length === 0 && <p className="text-xs text-muted-foreground italic">No sections in the template yet.</p>}
                  </div>
                  <Button size="sm" onClick={() => handleSaveSections(inv.id)} disabled={savingSections} className="h-7 text-xs gap-1">
                    {savingSections ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} Save sections
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {showPanel && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-sm">
          <p className="text-xs font-semibold text-muted-foreground">Select reviewers to add:</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-36 overflow-y-auto">
            {available.map(emp => (
              <button key={emp.id} type="button"
                onClick={() => setSelected(prev => toggle(prev, emp.id))}
                className={cn("flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs text-left transition-colors",
                  selected.includes(emp.id) ? "border-primary bg-primary/10 text-primary" : "border-border bg-card hover:bg-muted/40")}
              >
                <Avatar name={`${emp.first_name} ${emp.last_name}`} size="sm" />
                {emp.first_name} {emp.last_name}
              </button>
            ))}
            {available.length === 0 && <p className="text-xs text-muted-foreground col-span-3 italic">All employees already added</p>}
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground">Assign sections they may score:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {sections.map(s => (
                <label key={s.id} className="flex items-center gap-2 rounded-md border border-border bg-muted/10 px-2 py-1.5 cursor-pointer">
                  <input type="checkbox" checked={addSections.includes(s.id)}
                    onChange={() => setAddSections(prev => toggle(prev, s.id))}
                    className="h-3.5 w-3.5 rounded border-border accent-primary shrink-0" />
                  <span className="text-xs truncate">{secName(s)}</span>
                </label>
              ))}
              {sections.length === 0 && <p className="text-xs text-muted-foreground italic">No sections in the template yet.</p>}
            </div>
          </div>

          <label className="flex items-start gap-2 rounded-lg border border-border bg-muted/10 px-3 py-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={sendEmail}
              onChange={e => setSendEmail(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border accent-primary shrink-0"
            />
            <span className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">Email invitees to score</span> — sends a link asking them to submit scores.
              Leave unchecked for backdated reviews already scored elsewhere.
            </span>
          </label>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={!selected.length || adding} className="h-7 text-xs gap-1">
              {adding ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
              {sendEmail ? `Add & email (${selected.length})` : `Add (${selected.length})`}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowPanel(false); setSelected([]); setAddSections([]) }} className="h-7 text-xs">Cancel</Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Confirm Delete Modal ───────────────────────────────────────────────────────

function ConfirmDeleteModal({ onConfirm, onCancel, deleting }: {
  onConfirm: () => void; onCancel: () => void; deleting: boolean
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onCancel() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-card border border-border p-6 shadow-xl space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
            <Trash2 size={16} className="text-destructive" />
          </div>
          <div>
            <p className="font-bold text-sm">Delete KPI Review</p>
            <p className="text-xs text-muted-foreground mt-1">This will permanently delete the review and all associated scores and invitees. This cannot be undone.</p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="outline" onClick={onCancel} disabled={deleting} className="h-8 text-xs">Cancel</Button>
          <Button size="sm" onClick={onConfirm} disabled={deleting} className="h-8 text-xs gap-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground">
            {deleting ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
            Delete
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Create Review Modal ────────────────────────────────────────────────────────

function CreateReviewModal({ employees, currentPeriod, preselectedEmployeeId, preselectedQuarter, onSave, onClose, saving }: {
  employees: Employee[]; currentPeriod: string
  preselectedEmployeeId?: string; preselectedQuarter?: Quarter
  onSave: (d: { employee_id: string; period: string; title: string; deadline: string }) => Promise<void>
  onClose: () => void; saving: boolean
}) {
  const [employeeId, setEmployeeId] = useState(preselectedEmployeeId ?? employees[0]?.id ?? "")
  const [period, setPeriod]         = useState(preselectedQuarter ? quarterToPeriod(preselectedQuarter) : currentPeriod)
  const [customTitle, setCustomTitle] = useState<string | null>(null)
  const [deadline, setDeadline]     = useState("")

  const autoTitle = useMemo(() => {
    const sel = employees.find(e => e.id === employeeId)
    return sel ? `${sel.first_name} ${sel.last_name} — ${period} Review` : `${period} Performance Review`
  }, [employeeId, period, employees])
  const title = customTitle ?? autoTitle

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

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
            <input value={title} onChange={e => setCustomTitle(e.target.value)}
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

// ─── Final Comments ─────────────────────────────────────────────────────────────

function FinalCommentRow({ name, role, comment, canEdit, onSave }: {
  name: string; role: string; comment: string; canEdit: boolean
  onSave: (text: string) => Promise<void>
}) {
  const [val, setVal] = useState(comment)
  const [saving, setSaving] = useState(false)
  // Re-sync the field when the saved comment changes (e.g. after reload) —
  // React's "adjust state during render" pattern, no effect needed.
  const [syncedComment, setSyncedComment] = useState(comment)
  if (comment !== syncedComment) { setSyncedComment(comment); setVal(comment) }
  const dirty = val !== comment

  return (
    <div className="px-5 py-3">
      <div className="flex items-center gap-2 mb-1.5">
        <Avatar name={name} size="sm" />
        <span className="text-xs font-semibold">{name}</span>
        <span className="text-[10px] text-muted-foreground">{role}</span>
      </div>
      {canEdit ? (
        <>
          <textarea
            rows={2} value={val} onChange={e => setVal(e.target.value)}
            placeholder="Add a final comment…"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {dirty && (
            <div className="mt-1.5 flex gap-2">
              <Button size="sm" disabled={saving} onClick={async () => { setSaving(true); await onSave(val); setSaving(false) }} className="h-7 text-xs gap-1">
                {saving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setVal(comment)} className="h-7 text-xs">Cancel</Button>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground whitespace-pre-line">
          {comment ? comment : <span className="italic">No final comment</span>}
        </p>
      )}
    </div>
  )
}

function FinalComments({ invitees, comments, isHR, currentEmployeeId, onSave }: {
  invitees: ReviewInvitee[]; comments: FinalComment[]
  isHR: boolean; currentEmployeeId: string | null
  onSave: (authorId: string | null, comment: string) => Promise<void>
}) {
  const active = invitees.filter(i => i.status === "accepted" || i.status === "completed")
  const byAuthor = new Map<string, FinalComment>()
  for (const c of comments) byAuthor.set(c.author_id ?? "hr", c)

  const rows: { key: string; authorId: string | null; name: string; role: string }[] = [
    { key: "hr", authorId: null, name: "HR / Admin", role: "HR" },
    ...active.map(i => ({ key: i.invitee_id, authorId: i.invitee_id as string | null, name: `${i.invitee.first_name} ${i.invitee.last_name}`, role: "Reviewer" })),
  ]
  // Reviewers (non-HR view) see their own editable row plus any comment already left.
  const visible = isHR ? rows : rows.filter(r => r.authorId === currentEmployeeId || (byAuthor.get(r.authorId ?? "hr")?.comment ?? "") !== "")

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border bg-muted/20 flex items-center gap-2">
        <FileText size={16} className="text-primary" />
        <div>
          <h3 className="font-bold text-[14px] leading-snug">Final Comments</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Closing remarks from each reviewer.</p>
        </div>
      </div>
      <div className="divide-y divide-border">
        {visible.length === 0 ? (
          <p className="px-5 py-4 text-xs text-muted-foreground italic">No reviewers on this review yet.</p>
        ) : visible.map(r => (
          <FinalCommentRow
            key={r.key} name={r.name} role={r.role}
            comment={byAuthor.get(r.authorId ?? "hr")?.comment ?? ""}
            canEdit={isHR || r.authorId === currentEmployeeId}
            onSave={(text) => onSave(r.authorId, text)}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Quarter Panel (within staff row) ──────────────────────────────────────────

function QuarterPanel({ review, template, scores, finalComments, allEmployees, currentEmployeeId, isHR, onScoreChange, onSaveFinalComment, onAddInvitee, onRemoveInvitee, onSetSections, onStatusChange, onDelete, onAddItem, onEditItem, onRemoveItem, onResetItem, onUpdateReviewDetails }: {
  review: Review; template: TemplateSection[]; scores: Score[]; finalComments: FinalComment[]
  allEmployees: Employee[]; currentEmployeeId: string | null; isHR: boolean
  onScoreChange: (reviewId: string, itemId: string, score: number | null, comments: string, scorerId: string | null) => Promise<void>
  onSaveFinalComment: (reviewId: string, authorId: string | null, comment: string) => Promise<void>
  onAddInvitee: (reviewId: string, ids: string[], sendEmail: boolean, sectionIds: string[]) => Promise<void>
  onSetSections: (reviewId: string, reviewInviteeId: string, sectionIds: string[]) => Promise<void>
  onRemoveInvitee: (reviewId: string, id: string) => Promise<void>
  onStatusChange: (reviewId: string, status: string) => Promise<void>
  onDelete: (reviewId: string) => void
  onAddItem?: (reviewId: string, sectionId: string, data: { title: string; description: string; min_score: number; max_score: number }) => Promise<void>
  onEditItem?: (reviewId: string, itemId: string, data: { title: string; description: string; min_score: number; max_score: number }) => Promise<void>
  onRemoveItem?: (reviewId: string, itemId: string, title: string) => void
  onResetItem?: (reviewId: string, itemId: string) => void
  onUpdateReviewDetails?: (reviewId: string, data: { title: string; period: string; deadline: string | null }) => Promise<void>
}) {
  const invitees       = review.kpi_review_invitees ?? []
  // `template` is this review's merged template (global + overrides − hidden + custom).
  const reviewTemplate = template

  const [editDetails, setEditDetails]   = useState(false)
  const [detailTitle, setDetailTitle]   = useState(review.title)
  const [detailPeriod, setDetailPeriod] = useState(review.period)
  const [detailDeadline, setDetailDeadline] = useState(review.deadline ?? "")
  const [savingDetails, setSavingDetails]   = useState(false)

  async function handleSaveDetails() {
    if (!onUpdateReviewDetails || !detailTitle.trim() || !detailPeriod.trim()) return
    setSavingDetails(true)
    await onUpdateReviewDetails(review.id, {
      title: detailTitle.trim(),
      period: detailPeriod.trim(),
      deadline: detailDeadline || null,
    })
    setSavingDetails(false)
    setEditDetails(false)
  }

  const overallMax = reviewTemplate.reduce((a, s) => a + s.kpi_template_items.reduce((b, i) => b + i.max_score, 0), 0)
  const scoreMap = new Map<string, Score>()
  for (const s of scores) scoreMap.set(`${s.item_id}::${s.scorer_id ?? "hr"}`, s)
  const overallCurrent = reviewTemplate.reduce((total, section) => {
    const revs = assignedReviewers(invitees, section.id)
    return total + (section.kpi_template_items ?? []).reduce((a, item) => {
      const vals: number[] = []
      const hrv = scoreMap.get(`${item.id}::hr`)?.score
      if (hrv != null) vals.push(hrv)
      for (const inv of revs) {
        const v = scoreMap.get(`${item.id}::${inv.invitee_id}`)?.score
        if (v != null) vals.push(v)
      }
      return a + (vals.length > 0 ? vals.reduce((x, y) => x + y, 0) / vals.length : 0)
    }, 0)
  }, 0)

  const statusInfo = STATUS_DISPLAY[review.status] ?? STATUS_DISPLAY.draft
  const inviteeNames = invitees.map(i => `${i.invitee.first_name} ${i.invitee.last_name}`).join(", ")

  return (
    <div className="space-y-4">
      {/* Review meta strip */}
      <div className="flex flex-wrap items-center gap-3 bg-card border border-border rounded-xl px-4 py-3 shadow-sm">
        {inviteeNames && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Scorers</span>
            <span className="text-xs font-medium">{inviteeNames}</span>
          </div>
        )}
        {overallMax > 0 && (
          <>
            {inviteeNames && <div className="hidden sm:block w-px h-8 bg-border" />}
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total Score</span>
              <span className="text-sm font-bold">{fmtScore(overallCurrent)}<span className="text-muted-foreground font-medium text-xs"> / {overallMax}</span></span>
            </div>
          </>
        )}
        <div className="hidden sm:block w-px h-8 bg-border" />
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Status</span>
          <span className={cn("inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full border", statusInfo.chipCls)}>
            {statusInfo.label}
          </span>
        </div>
        {isHR && (
          <>
            <div className="hidden sm:block w-px h-8 bg-border" />
            <div className="flex items-center gap-2 ml-auto">
              {onUpdateReviewDetails && (
                <button
                  type="button"
                  onClick={() => {
                    setDetailTitle(review.title); setDetailPeriod(review.period)
                    setDetailDeadline(review.deadline ?? ""); setEditDetails(v => !v)
                  }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1.5 rounded-lg border border-border hover:border-primary/60"
                >
                  <Pencil size={11} /> Edit details
                </button>
              )}
              <select
                value={review.status}
                onChange={e => onStatusChange(review.id, e.target.value)}
                className="text-xs rounded-lg border border-border bg-card px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="draft">Set Draft</option>
                <option value="active">Publish</option>
                <option value="completed">Complete</option>
              </select>
              <button
                type="button"
                onClick={() => onDelete(review.id)}
                className="flex items-center gap-1 text-xs text-destructive hover:opacity-70 transition-opacity px-2 py-1.5 rounded-lg border border-destructive/30 hover:bg-destructive/5"
              >
                <Trash2 size={11} /> Delete
              </button>
            </div>
          </>
        )}
      </div>

      {isHR && editDetails && onUpdateReviewDetails && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
          <p className="text-sm font-semibold">Edit Review Details</p>
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="sm:col-span-3">
              <label className="text-xs font-medium text-muted-foreground block mb-1">Title</label>
              <input value={detailTitle} onChange={e => setDetailTitle(e.target.value)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Period</label>
              <input value={detailPeriod} onChange={e => setDetailPeriod(e.target.value)} placeholder="e.g. Q3 2026"
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Deadline</label>
              <input type="date" value={detailDeadline} onChange={e => setDetailDeadline(e.target.value)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSaveDetails} disabled={!detailTitle.trim() || !detailPeriod.trim() || savingDetails} className="h-7 text-xs gap-1">
              {savingDetails ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditDetails(false)} className="h-7 text-xs">Cancel</Button>
          </div>
        </div>
      )}

      {isHR && (
        <InviteePanel review={review} allEmployees={allEmployees} template={template} onAddInvitee={onAddInvitee} onRemoveInvitee={onRemoveInvitee} onSetSections={onSetSections} />
      )}

      <div className="flex flex-col gap-3">
        {reviewTemplate.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-3">
            <BarChart3 size={28} className="opacity-30" />
            <p className="text-sm">No KPI template configured yet.</p>
          </div>
        ) : reviewTemplate.map((section, idx) => (
          <SectionAccordion
            key={section.id} section={section} sectionIndex={idx}
            scores={scores} invitees={review.kpi_review_invitees ?? []}
            isHR={isHR} currentEmployeeId={currentEmployeeId}
            onScoreChange={(itemId, score, comments, scorerId) => onScoreChange(review.id, itemId, score, comments, scorerId)}
            onAddItem={onAddItem ? (sectionId, data) => onAddItem(review.id, sectionId, data) : undefined}
            onEditItem={onEditItem ? (itemId, data) => onEditItem(review.id, itemId, data) : undefined}
            onDeleteItem={onRemoveItem ? (itemId, title) => onRemoveItem(review.id, itemId, title) : undefined}
            onResetItem={onResetItem ? (itemId) => onResetItem(review.id, itemId) : undefined}
            defaultOpen={idx === 0}
          />
        ))}
      </div>

      <FinalComments
        invitees={review.kpi_review_invitees ?? []}
        comments={finalComments}
        isHR={isHR}
        currentEmployeeId={currentEmployeeId}
        onSave={(authorId, comment) => onSaveFinalComment(review.id, authorId, comment)}
      />
    </div>
  )
}

// ─── Staff Row (compact — opens the single-person detail view) ────────────────────

function StaffRow({ employee, reviews, scores, reviewTemplates, onOpen }: {
  employee: Employee
  reviews: Review[]
  scores: Record<string, Score[]>
  reviewTemplates: Record<string, TemplateSection[]>
  onOpen: (employeeId: string, quarter?: Quarter) => void
}) {
  const reviewByQuarter = useMemo(() => {
    const map: Partial<Record<Quarter, Review>> = {}
    for (const r of reviews) {
      const q = periodToQuarter(r.period)
      if (q) map[q] = r
    }
    return map
  }, [reviews])

  const name = `${employee.first_name} ${employee.last_name}`
  const deptName = (employee as { department?: { name: string } | null }).department?.name ?? ""

  return (
    <div className="border-b border-border last:border-b-0">
      <div
        className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors cursor-pointer"
        onClick={() => onOpen(employee.id)}
      >
        <Avatar name={name} size="md" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-foreground">{name}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {employee.job_title}{deptName ? ` · ${deptName}` : ""}
          </div>
        </div>

        {/* Quarter chips — click a chip to open that quarter directly */}
        <div className="flex items-center gap-1.5 flex-wrap justify-end" onClick={e => e.stopPropagation()}>
          {QUARTERS.map(q => {
            const review = reviewByQuarter[q]
            if (review) {
              const statusInfo = STATUS_DISPLAY[review.status] ?? STATUS_DISPLAY.draft
              const reviewScores = scores[review.id] ?? []
              const rtpl = reviewTemplates[review.id] ?? []
              const totalMax = rtpl.reduce((a, s) => a + (s.kpi_template_items ?? []).reduce((b, i) => b + i.max_score, 0), 0)
              const current = reviewScores.reduce((a, s) => a + (s.score ?? 0), 0)
              return (
                <button
                  key={q}
                  type="button"
                  onClick={() => onOpen(employee.id, q)}
                  className={cn(
                    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-all hover:shadow-sm",
                    statusInfo.chipCls
                  )}
                >
                  Q{q} · {totalMax > 0 ? `${fmtScore(current)}/${totalMax}` : "—"} · {statusInfo.label}
                </button>
              )
            }
            return (
              <button
                key={q}
                type="button"
                onClick={() => onOpen(employee.id, q)}
                className="inline-flex items-center rounded-full border border-dashed border-border px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:border-primary/50 hover:text-primary transition-all"
              >
                Q{q}
              </button>
            )
          })}
        </div>

        <div className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-muted-foreground shrink-0 ml-1">
          <ChevronRight size={14} />
        </div>
      </div>
    </div>
  )
}

// ─── Employee Review Detail (single-person full view) ─────────────────────────────

function EmployeeReviewDetail({ employee, reviews, scores, reviewTemplates, finalComments, allEmployees, currentEmployeeId, onScoreChange, onSaveFinalComment, onAddInvitee, onRemoveInvitee, onSetSections, onStatusChange, onDelete, onAddItem, onEditItem, onRemoveItem, onResetItem, onUpdateReviewDetails, onCreateReview, onBack, initialQuarter, onExportScores }: {
  employee: Employee
  reviews: Review[]
  scores: Record<string, Score[]>
  reviewTemplates: Record<string, TemplateSection[]>
  finalComments: Record<string, FinalComment[]>
  allEmployees: Employee[]
  currentEmployeeId: string | null
  onScoreChange: (reviewId: string, itemId: string, score: number | null, comments: string, scorerId: string | null) => Promise<void>
  onSaveFinalComment: (reviewId: string, authorId: string | null, comment: string) => Promise<void>
  onAddInvitee: (reviewId: string, ids: string[], sendEmail: boolean, sectionIds: string[]) => Promise<void>
  onSetSections: (reviewId: string, reviewInviteeId: string, sectionIds: string[]) => Promise<void>
  onRemoveInvitee: (reviewId: string, id: string) => Promise<void>
  onStatusChange: (reviewId: string, status: string) => Promise<void>
  onDelete: (reviewId: string) => void
  onAddItem?: (reviewId: string, sectionId: string, data: { title: string; description: string; min_score: number; max_score: number }) => Promise<void>
  onEditItem?: (reviewId: string, itemId: string, data: { title: string; description: string; min_score: number; max_score: number }) => Promise<void>
  onRemoveItem?: (reviewId: string, itemId: string, title: string) => void
  onResetItem?: (reviewId: string, itemId: string) => void
  onUpdateReviewDetails?: (reviewId: string, data: { title: string; period: string; deadline: string | null }) => Promise<void>
  onCreateReview: (employeeId: string, quarter: Quarter) => void
  onBack: () => void
  initialQuarter?: Quarter
  onExportScores: (format: "csv" | "xlsx", reviewId?: string) => Promise<void>
}) {
  const [exportingOne, setExportingOne] = useState(false)
  const reviewByQuarter = useMemo(() => {
    const map: Partial<Record<Quarter, Review>> = {}
    for (const r of reviews) {
      const q = periodToQuarter(r.period)
      if (q) map[q] = r
    }
    return map
  }, [reviews])

  const visibleQuarters = useMemo<Quarter[]>(() => {
    const withReview = QUARTERS.filter(q => reviewByQuarter[q])
    const nextEmpty = QUARTERS.find(q => !reviewByQuarter[q])
    const all = nextEmpty ? [...withReview, nextEmpty] : withReview
    return all.sort((a, b) => a - b) as Quarter[]
  }, [reviewByQuarter])

  const name = `${employee.first_name} ${employee.last_name}`
  const deptName = (employee as { department?: { name: string } | null }).department?.name ?? ""

  const [activeQuarter, setActiveQuarter] = useState<Quarter>(initialQuarter ?? visibleQuarters[0] ?? 1)
  const activeReview = reviewByQuarter[activeQuarter]

  return (
    <div className="space-y-4">
      {/* Back + person header */}
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" onClick={onBack} className="gap-1.5 h-9 text-xs shrink-0">
          <ChevronLeft size={14} /> All employees
        </Button>
        <div className="flex items-center gap-3 flex-1 min-w-0 rounded-2xl border border-border bg-card px-4 py-2.5 shadow-sm">
          <Avatar name={name} size="md" />
          <div className="min-w-0 flex-1">
            <div className="font-bold text-sm text-foreground truncate">{name}</div>
            <div className="text-xs text-muted-foreground truncate">
              {employee.job_title}{deptName ? ` · ${deptName}` : ""}
            </div>
          </div>
          {activeReview && (
            <Button size="sm" variant="outline" disabled={exportingOne}
              onClick={async () => { setExportingOne(true); await onExportScores("xlsx", activeReview.id); setExportingOne(false) }}
              className="gap-1.5 h-8 text-xs shrink-0">
              {exportingOne ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Export
            </Button>
          )}
        </div>
      </div>

      {/* Quarter tab bar */}
      <div className="flex items-center gap-0 border-b border-border">
        {visibleQuarters.map(q => (
          <button
            key={q}
            type="button"
            onClick={() => setActiveQuarter(q)}
            className={cn(
              "px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap",
              activeQuarter === q
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {QUARTER_LABELS[q]}
            {reviewByQuarter[q] && (
              <span className={cn(
                "ml-1.5 inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium",
                STATUS_DISPLAY[reviewByQuarter[q]!.status]?.chipCls ?? ""
              )}>
                {STATUS_DISPLAY[reviewByQuarter[q]!.status]?.label}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeReview ? (
        <QuarterPanel
          review={activeReview}
          template={reviewTemplates[activeReview.id] ?? []}
          scores={scores[activeReview.id] ?? []}
          finalComments={finalComments[activeReview.id] ?? []}
          allEmployees={allEmployees}
          currentEmployeeId={currentEmployeeId}
          isHR={true}
          onScoreChange={onScoreChange}
          onSaveFinalComment={onSaveFinalComment}
          onAddInvitee={onAddInvitee}
          onRemoveInvitee={onRemoveInvitee}
          onSetSections={onSetSections}
          onStatusChange={onStatusChange}
          onDelete={onDelete}
          onAddItem={onAddItem}
          onEditItem={onEditItem}
          onRemoveItem={onRemoveItem}
          onResetItem={onResetItem}
          onUpdateReviewDetails={onUpdateReviewDetails}
        />
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
          <BarChart3 size={28} className="opacity-30" />
          <p className="text-sm font-medium">No Q{activeQuarter} review set up yet</p>
          <Button size="sm" onClick={() => onCreateReview(employee.id, activeQuarter)} className="gap-1.5 h-8 text-xs">
            <Plus size={13} /> Set up Q{activeQuarter}
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── HR Admin View ──────────────────────────────────────────────────────────────

function HRAdminView({ reviewTemplates, reviews, scores, finalComments, allEmployees, currentEmployeeId, onScoreChange, onSaveFinalComment, onAddInvitee, onRemoveInvitee, onSetSections, onStatusChange, onDelete, onAddItem, onEditItem, onRemoveItem, onResetItem, onUpdateReviewDetails, onShowCreate, onManageTemplate, onExportScores, onImportScores }: {
  reviewTemplates: Record<string, TemplateSection[]>
  reviews: Review[]
  scores: Record<string, Score[]>
  finalComments: Record<string, FinalComment[]>
  allEmployees: Employee[]
  currentEmployeeId: string | null
  onScoreChange: (reviewId: string, itemId: string, score: number | null, comments: string, scorerId: string | null) => Promise<void>
  onSaveFinalComment: (reviewId: string, authorId: string | null, comment: string) => Promise<void>
  onAddInvitee: (reviewId: string, ids: string[], sendEmail: boolean, sectionIds: string[]) => Promise<void>
  onSetSections: (reviewId: string, reviewInviteeId: string, sectionIds: string[]) => Promise<void>
  onRemoveInvitee: (reviewId: string, id: string) => Promise<void>
  onStatusChange: (reviewId: string, status: string) => Promise<void>
  onDelete: (reviewId: string) => void
  onAddItem?: (reviewId: string, sectionId: string, data: { title: string; description: string; min_score: number; max_score: number }) => Promise<void>
  onEditItem?: (reviewId: string, itemId: string, data: { title: string; description: string; min_score: number; max_score: number }) => Promise<void>
  onRemoveItem?: (reviewId: string, itemId: string, title: string) => void
  onResetItem?: (reviewId: string, itemId: string) => void
  onUpdateReviewDetails?: (reviewId: string, data: { title: string; period: string; deadline: string | null }) => Promise<void>
  onShowCreate: (employeeId?: string, quarter?: Quarter) => void
  onManageTemplate: () => void
  onExportScores: (format: "csv" | "xlsx", reviewId?: string) => Promise<void>
  onImportScores: (file: File) => Promise<void>
}) {
  const [searchQ, setSearchQ]         = useState("")
  const scoresFileRef = useRef<HTMLInputElement>(null)
  const [scoresBusy, setScoresBusy]   = useState(false)
  const [deptFilter, setDeptFilter]   = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedId, setSelectedId]   = useState<string | null>(null)
  const [selectedQuarter, setSelectedQuarter] = useState<Quarter | undefined>(undefined)

  // Build a map: employee_id → reviews[]
  const reviewsByEmployee = useMemo(() => {
    const map: Record<string, Review[]> = {}
    for (const r of reviews) {
      if (!map[r.employee_id]) map[r.employee_id] = []
      map[r.employee_id].push(r)
    }
    return map
  }, [reviews])

  // Stat cards
  const totalStaff = allEmployees.length
  const q1Reviews = reviews.filter(r => periodToQuarter(r.period) === 1)
  const q1Published = q1Reviews.filter(r => r.status === "active" || r.status === "completed").length
  const q1Draft = q1Reviews.filter(r => r.status === "draft").length
  const employeesWithQ1 = new Set(q1Reviews.map(r => r.employee_id))
  const notStarted = allEmployees.filter(e => !employeesWithQ1.has(e.id)).length

  // Departments for filter
  const departments = useMemo(() => {
    const depts = new Set<string>()
    for (const e of allEmployees) {
      const d = (e as { department?: { name: string } | null }).department?.name
      if (d) depts.add(d)
    }
    return Array.from(depts).sort()
  }, [allEmployees])

  // Filtered staff list
  const filteredEmployees = useMemo(() => {
    return allEmployees.filter(emp => {
      const deptName = (emp as { department?: { name: string } | null }).department?.name ?? ""
      if (deptFilter !== "all" && deptName !== deptFilter) return false

      if (statusFilter !== "all") {
        const empReviews = reviewsByEmployee[emp.id] ?? []
        const q1 = empReviews.find(r => periodToQuarter(r.period) === 1)
        if (statusFilter === "published" && q1?.status !== "active") return false
        if (statusFilter === "draft" && q1?.status !== "draft") return false
        if (statusFilter === "notstarted" && q1) return false
      }

      if (searchQ) {
        const q = searchQ.toLowerCase()
        const fullName = `${emp.first_name} ${emp.last_name}`.toLowerCase()
        const deptName2 = (emp as { department?: { name: string } | null }).department?.name?.toLowerCase() ?? ""
        if (!fullName.includes(q) && !emp.job_title?.toLowerCase().includes(q) && !deptName2.includes(q)) return false
      }

      return true
    })
  }, [allEmployees, deptFilter, statusFilter, searchQ, reviewsByEmployee])

  // Detail view — a single person, full screen, with a Back button.
  const selectedEmp = selectedId ? allEmployees.find(e => e.id === selectedId) : undefined
  if (selectedEmp) {
    return (
      <EmployeeReviewDetail
        key={selectedEmp.id}
        employee={selectedEmp}
        reviews={reviewsByEmployee[selectedEmp.id] ?? []}
        scores={scores}
        reviewTemplates={reviewTemplates}
        finalComments={finalComments}
        allEmployees={allEmployees}
        currentEmployeeId={currentEmployeeId}
        onScoreChange={onScoreChange}
        onSaveFinalComment={onSaveFinalComment}
        onAddInvitee={onAddInvitee}
        onRemoveInvitee={onRemoveInvitee}
        onSetSections={onSetSections}
        onStatusChange={onStatusChange}
        onDelete={onDelete}
        onAddItem={onAddItem}
        onEditItem={onEditItem}
        onRemoveItem={onRemoveItem}
        onResetItem={onResetItem}
        onUpdateReviewDetails={onUpdateReviewDetails}
        onCreateReview={(empId, quarter) => onShowCreate(empId, quarter)}
        onBack={() => setSelectedId(null)}
        initialQuarter={selectedQuarter}
        onExportScores={onExportScores}
      />
    )
  }

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">KPI Reviews — 2026</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {totalStaff} staff member{totalStaff !== 1 ? "s" : ""} · Q1 in progress
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <input
            ref={scoresFileRef}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ""
              if (!f) return
              setScoresBusy(true)
              await onImportScores(f)
              setScoresBusy(false)
            }}
          />
          <Button size="sm" variant="outline" disabled={scoresBusy}
            onClick={async () => { setScoresBusy(true); await onExportScores("xlsx"); setScoresBusy(false) }}
            className="gap-1.5 h-9 text-xs">
            <Download size={13} /> Export all scores
          </Button>
          <Button size="sm" variant="outline" disabled={scoresBusy}
            onClick={() => scoresFileRef.current?.click()}
            className="gap-1.5 h-9 text-xs">
            {scoresBusy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Import scores
          </Button>
          <Button size="sm" variant="outline" onClick={onManageTemplate} className="gap-1.5 h-9 text-xs">
            <SlidersHorizontal size={13} /> Manage Template
          </Button>
          <Button size="sm" onClick={() => onShowCreate()} className="gap-1.5 h-9 text-xs">
            <Plus size={13} /> New Review
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Total Staff</div>
          <div className="text-2xl font-bold">{totalStaff}</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider mb-1">Q1 Published</div>
          <div className="text-2xl font-bold text-emerald-700">{q1Published}</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider mb-1">Q1 Draft</div>
          <div className="text-2xl font-bold text-amber-700">{q1Draft}</div>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Not Started</div>
          <div className="text-2xl font-bold text-muted-foreground">{notStarted}</div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder="Search name, title, department…"
            className="w-full rounded-xl border border-border bg-card pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <select
          value={deptFilter}
          onChange={e => setDeptFilter(e.target.value)}
          className="rounded-xl border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary sm:w-48"
        >
          <option value="all">All departments</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="rounded-xl border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary sm:w-44"
        >
          <option value="all">All status</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="notstarted">Not started</option>
        </select>
      </div>

      {/* Staff list */}
      {filteredEmployees.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-3 border border-dashed border-border rounded-2xl">
          <Users size={28} className="opacity-30" />
          <p className="text-sm">No staff match your filters.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
          {filteredEmployees.map(emp => (
            <StaffRow
              key={emp.id}
              employee={emp}
              reviews={reviewsByEmployee[emp.id] ?? []}
              scores={scores}
              reviewTemplates={reviewTemplates}
              onOpen={(id, quarter) => { setSelectedId(id); setSelectedQuarter(quarter) }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── My Assignments tab (non-HR / HR-as-invitee) ────────────────────────────────

function MyAssignmentsView({ reviews, scores, reviewTemplates, finalComments, currentEmployeeId, isHR, onScoreChange, onSaveFinalComment, loadAll, showToast }: {
  reviews: Review[]
  scores: Record<string, Score[]>
  reviewTemplates: Record<string, TemplateSection[]>
  finalComments: Record<string, FinalComment[]>
  currentEmployeeId: string | null
  isHR: boolean
  onScoreChange: (reviewId: string, itemId: string, score: number | null, comments: string, scorerId: string | null) => Promise<void>
  onSaveFinalComment: (reviewId: string, authorId: string | null, comment: string) => Promise<void>
  loadAll: (opts?: { silent?: boolean }) => Promise<void>
  showToast: (msg: string) => void
}) {
  const myAssignments = isHR
    ? reviews.filter(r => r.kpi_review_invitees?.some(i => i.invitee_id === currentEmployeeId))
    : reviews

  return (
    <div className="space-y-4">
      {myAssignments.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
          <FileText size={36} className="opacity-30" />
          <p className="text-sm">No KPI reviews found yet.</p>
        </div>
      ) : myAssignments.map(review => {
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
                        showToast("Invitation accepted"); await loadAll({ silent: true })
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
                        showToast("Invitation declined"); await loadAll({ silent: true })
                      }}
                    >
                      <X size={11} /> Decline
                    </Button>
                  </>
                )}
              </div>
            </div>
            {(() => {
              const inviteeActive = myInv && (myInv.status === "accepted" || myInv.status === "completed")
              const subjectReadOnly = !myInv && !isHR && (review.status === "active" || review.status === "completed")
              if (!inviteeActive && !subjectReadOnly) return null
              return (
                <div className="px-5 py-5 space-y-3">
                  {(reviewTemplates[review.id] ?? []).map((section, idx) => (
                    <SectionAccordion
                      key={section.id} section={section} sectionIndex={idx}
                      scores={scores[review.id] ?? []} invitees={review.kpi_review_invitees ?? []}
                      isHR={false} currentEmployeeId={currentEmployeeId}
                      onScoreChange={(itemId, score, comments, scorerId) => onScoreChange(review.id, itemId, score, comments, scorerId)}
                      defaultOpen={idx === 0}
                    />
                  ))}
                  <FinalComments
                    invitees={review.kpi_review_invitees ?? []}
                    comments={finalComments[review.id] ?? []}
                    isHR={false}
                    currentEmployeeId={currentEmployeeId}
                    onSave={(authorId, comment) => onSaveFinalComment(review.id, authorId, comment)}
                  />
                </div>
              )
            })()}
          </div>
        )
      })}
    </div>
  )
}

// ─── Manage Template Modal ──────────────────────────────────────────────────────

// Global KPI item editor for one section (Manage Template). Changes here
// apply to the global template — i.e. all staff (except a staff member who
// has their own override for that KPI).
function GlobalItemsEditor({ section, onAdd, onEdit, onDelete }: {
  section: TemplateSection
  onAdd: (sectionId: string, data: { title: string; description: string; min_score: number; max_score: number }) => Promise<void>
  onEdit: (itemId: string, data: { title: string; description: string; min_score: number; max_score: number }) => Promise<void>
  onDelete: (itemId: string, title: string) => void
}) {
  const items = (section.kpi_template_items ?? []).slice().sort((a, b) => a.position - b.position)
  const [editId, setEditId] = useState<string | null>(null)
  const [t, setT] = useState(""); const [d, setD] = useState(""); const [mn, setMn] = useState(0); const [mx, setMx] = useState(10)
  const [busy, setBusy] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [nt, setNt] = useState(""); const [nd, setNd] = useState(""); const [nmx, setNmx] = useState(10)

  function startEdit(it: TemplateItem) { setEditId(it.id); setT(it.title); setD(it.description ?? ""); setMn(it.min_score); setMx(it.max_score) }
  async function saveEdit(id: string) { if (!t.trim()) return; setBusy(true); await onEdit(id, { title: t.trim(), description: d, min_score: mn, max_score: mx }); setBusy(false); setEditId(null) }
  async function saveAdd() { if (!nt.trim()) return; setBusy(true); await onAdd(section.id, { title: nt.trim(), description: nd, min_score: 0, max_score: nmx }); setNt(""); setNd(""); setNmx(10); setBusy(false); setShowAdd(false) }

  return (
    <div className="mt-2 pt-2 border-t border-border space-y-2">
      {items.length === 0 && <p className="text-[11px] text-muted-foreground italic">No global KPIs in this section.</p>}
      {items.map(it => editId === it.id ? (
        <div key={it.id} className="rounded-md border border-primary/30 bg-primary/5 p-2 space-y-2">
          <input value={t} onChange={e => setT(e.target.value)} className="w-full rounded border border-border bg-card px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
          <textarea rows={2} value={d} onChange={e => setD(e.target.value)} placeholder="Description" className="w-full rounded border border-border bg-card px-2 py-1 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary" />
          <div className="flex gap-2 items-center flex-wrap">
            <label className="text-[10px] text-muted-foreground">Min <input type="number" value={mn} onChange={e => setMn(Number(e.target.value))} className="ml-1 w-14 rounded border border-border bg-card px-1 py-0.5 text-xs" /></label>
            <label className="text-[10px] text-muted-foreground">Max <input type="number" value={mx} onChange={e => setMx(Number(e.target.value))} className="ml-1 w-14 rounded border border-border bg-card px-1 py-0.5 text-xs" /></label>
            <Button size="sm" onClick={() => saveEdit(it.id)} disabled={busy || !t.trim()} className="h-6 text-[11px] ml-auto">Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditId(null)} className="h-6 text-[11px]">Cancel</Button>
          </div>
        </div>
      ) : (
        <div key={it.id} className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5">
          <span className="text-xs flex-1 truncate">{it.title}</span>
          <span className="text-[10px] text-muted-foreground shrink-0">max {it.max_score}</span>
          <button type="button" onClick={() => startEdit(it)} className="text-muted-foreground hover:text-primary shrink-0"><Pencil size={11} /></button>
          <button type="button" onClick={() => onDelete(it.id, it.title)} className="text-destructive hover:opacity-70 shrink-0"><Trash2 size={11} /></button>
        </div>
      ))}
      {showAdd ? (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-2 space-y-2">
          <input autoFocus value={nt} onChange={e => setNt(e.target.value)} placeholder="KPI name" className="w-full rounded border border-border bg-card px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
          <textarea rows={2} value={nd} onChange={e => setNd(e.target.value)} placeholder="Description" className="w-full rounded border border-border bg-card px-2 py-1 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary" />
          <div className="flex gap-2 items-center">
            <label className="text-[10px] text-muted-foreground">Max <input type="number" value={nmx} onChange={e => setNmx(Number(e.target.value))} className="ml-1 w-14 rounded border border-border bg-card px-1 py-0.5 text-xs" /></label>
            <Button size="sm" onClick={saveAdd} disabled={busy || !nt.trim()} className="h-6 text-[11px] ml-auto">Add KPI</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)} className="h-6 text-[11px]">Cancel</Button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setShowAdd(true)} className="text-[11px] text-primary hover:underline">+ Add KPI (all staff)</button>
      )}
    </div>
  )
}

function ManageTemplateModal({ template, currentPeriod, onClose, onSetPeriod, onCreateSection, onRenameSection, onReorderSection, onDeleteSection, onExport, onImport, onAddGlobalItem, onEditGlobalItem, onDeleteGlobalItem }: {
  template: TemplateSection[]
  currentPeriod: string
  onClose: () => void
  onSetPeriod: (value: string) => Promise<void>
  onCreateSection: (title: string, type: "hr" | "invitee") => Promise<void>
  onRenameSection: (id: string, title: string) => Promise<void>
  onReorderSection: (id: string, direction: "up" | "down") => Promise<void>
  onDeleteSection: (id: string, title: string) => void
  onExport: (format: "csv" | "xlsx") => Promise<void>
  onImport: (file: File) => Promise<void>
  onAddGlobalItem: (sectionId: string, data: { title: string; description: string; min_score: number; max_score: number }) => Promise<void>
  onEditGlobalItem: (itemId: string, data: { title: string; description: string; min_score: number; max_score: number }) => Promise<void>
  onDeleteGlobalItem: (itemId: string, title: string) => void
}) {
  const [expandedSection, setExpandedSection] = useState<string | null>(null)
  const sorted = [...template].sort((a, b) => a.position - b.position)

  const [period, setPeriod]           = useState(currentPeriod)
  const [savingPeriod, setSavingPeriod] = useState(false)
  const [newTitle, setNewTitle]       = useState("")
  const [newType, setNewType]         = useState<"hr" | "invitee">("invitee")
  const [addingSection, setAddingSection] = useState(false)
  const [editId, setEditId]           = useState<string | null>(null)
  const [editVal, setEditVal]         = useState("")
  const [savingEdit, setSavingEdit]   = useState(false)
  const [importing, setImporting]     = useState(false)
  const [exporting, setExporting]     = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  async function saveRename(id: string) {
    if (!editVal.trim()) { setEditId(null); return }
    setSavingEdit(true)
    await onRenameSection(id, editVal.trim())
    setSavingEdit(false)
    setEditId(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-card border border-border p-6 shadow-xl space-y-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg">Manage KPI Template</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Sections, KPI items and the active review period</p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X size={18} /></button>
        </div>

        {/* Current period */}
        <div className="rounded-xl border border-border bg-muted/10 p-4 space-y-2">
          <p className="text-sm font-semibold">Current Period</p>
          <p className="text-xs text-muted-foreground">The period new reviews default to (e.g. &quot;Q3 2026&quot;).</p>
          <div className="flex gap-2">
            <input value={period} onChange={e => setPeriod(e.target.value)} placeholder="e.g. Q3 2026"
              className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            <Button size="sm" disabled={!period.trim() || savingPeriod}
              onClick={async () => { setSavingPeriod(true); await onSetPeriod(period.trim()); setSavingPeriod(false) }}
              className="h-9 text-xs gap-1"
            >
              {savingPeriod ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Save
            </Button>
          </div>
        </div>

        {/* Import / Export */}
        <div className="rounded-xl border border-border bg-muted/10 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={15} className="text-primary" />
            <p className="text-sm font-semibold">Import / Export template</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Export the current template as a spreadsheet, add the rest of your sections and KPIs in the
            same columns, then import it back. Matching is by section &amp; KPI name — existing rows are
            updated, new ones added, and anything not in the file is left untouched.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" disabled={exporting}
              onClick={async () => { setExporting(true); await onExport("csv"); setExporting(false) }}
              className="h-8 text-xs gap-1.5">
              <Download size={12} /> Export CSV
            </Button>
            <Button size="sm" variant="outline" disabled={exporting}
              onClick={async () => { setExporting(true); await onExport("xlsx"); setExporting(false) }}
              className="h-8 text-xs gap-1.5">
              <Download size={12} /> Export XLSX
            </Button>
            <div className="w-px h-6 bg-border mx-1" />
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (!f) return
                setImporting(true)
                await onImport(f)
                setImporting(false)
                if (fileInputRef.current) fileInputRef.current.value = ""
              }}
            />
            <Button size="sm" disabled={importing}
              onClick={() => fileInputRef.current?.click()}
              className="h-8 text-xs gap-1.5">
              {importing ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Import file
            </Button>
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-3">
          <p className="text-sm font-semibold">Sections</p>
          {sorted.length === 0 && <p className="text-xs text-muted-foreground italic">No sections yet — add one below.</p>}
          <div className="space-y-2">
            {sorted.map((section, idx) => (
              <div key={section.id} className="rounded-xl border border-border bg-card">
               <div className="flex items-center gap-2 px-3 py-2.5">
                <div className="flex flex-col">
                  <button type="button" disabled={idx === 0} onClick={() => onReorderSection(section.id, "up")}
                    className="text-muted-foreground hover:text-primary disabled:opacity-20 disabled:cursor-not-allowed">
                    <ArrowUp size={13} />
                  </button>
                  <button type="button" disabled={idx === sorted.length - 1} onClick={() => onReorderSection(section.id, "down")}
                    className="text-muted-foreground hover:text-primary disabled:opacity-20 disabled:cursor-not-allowed">
                    <ArrowDown size={13} />
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  {editId === section.id ? (
                    <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") saveRename(section.id) }}
                      className="w-full rounded-lg border border-primary bg-card px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                  ) : (
                    <p className="text-sm font-medium truncate">{section.title || "(untitled section)"}</p>
                  )}
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {section.kpi_template_items?.length ?? 0} item{(section.kpi_template_items?.length ?? 0) !== 1 ? "s" : ""}
                  </span>
                </div>
                {editId === section.id ? (
                  <>
                    <Button size="sm" onClick={() => saveRename(section.id)} disabled={savingEdit} className="h-7 text-xs gap-1">
                      {savingEdit ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditId(null)} className="h-7 text-xs">Cancel</Button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => setExpandedSection(expandedSection === section.id ? null : section.id)}
                      className="h-7 px-2 rounded-lg border border-border flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary hover:border-primary/60 transition-colors">
                      <ChevronDown size={11} className={cn("transition-transform", expandedSection === section.id ? "" : "-rotate-90")} /> KPIs
                    </button>
                    <button type="button" onClick={() => { setEditId(section.id); setEditVal(section.title) }}
                      className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/60 transition-colors">
                      <Pencil size={12} />
                    </button>
                    <button type="button" onClick={() => onDeleteSection(section.id, section.title)}
                      className="w-7 h-7 rounded-lg border border-destructive/30 flex items-center justify-center text-destructive hover:bg-destructive/5 transition-colors">
                      <Trash2 size={12} />
                    </button>
                  </>
                )}
               </div>
               {expandedSection === section.id && (
                 <div className="px-3 pb-3">
                   <GlobalItemsEditor section={section} onAdd={onAddGlobalItem} onEdit={onEditGlobalItem} onDelete={onDeleteGlobalItem} />
                 </div>
               )}
              </div>
            ))}
          </div>

          {/* Add section */}
          <div className="rounded-xl border border-dashed border-border p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Add a section</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Section name, e.g. Leadership"
                className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
              <select value={newType} onChange={e => setNewType(e.target.value as "hr" | "invitee")}
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="invitee">Scored by peers</option>
                <option value="hr">Scored by HR</option>
              </select>
              <Button size="sm" disabled={!newTitle.trim() || addingSection}
                onClick={async () => { setAddingSection(true); await onCreateSection(newTitle.trim(), newType); setNewTitle(""); setNewType("invitee"); setAddingSection(false) }}
                className="h-9 text-xs gap-1">
                {addingSection ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Add
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Use &quot;KPIs&quot; on a section to add or edit its KPIs for all staff. Per-staff changes are made inside each person&apos;s review.</p>
          </div>
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
  const [reviewTemplates, setReviewTemplates] = useState<Record<string, TemplateSection[]>>({})
  const [reviews, setReviews]             = useState<Review[]>([])
  const [scores, setScores]               = useState<Record<string, Score[]>>({})
  const [finalComments, setFinalComments] = useState<Record<string, FinalComment[]>>({})
  const [allEmployees, setAllEmployees]   = useState<Employee[]>([])
  const [loading, setLoading]             = useState(true)
  const [showCreate, setShowCreate]       = useState(false)
  const [createPreselect, setCreatePreselect] = useState<{ employeeId?: string; quarter?: Quarter }>({})
  const [creating, setCreating]           = useState(false)
  const [currentPeriod, setCurrentPeriod] = useState("Q1 2026")
  const [toast, setToast]                 = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget]   = useState<string | null>(null)
  const [deleting, setDeleting]           = useState(false)
  const [showManage, setShowManage]       = useState(false)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  const loadAll = useCallback(async (opts?: { silent?: boolean }) => {
    // Silent refreshes skip the full-screen spinner so the list (and any
    // expanded staff row) stays mounted and keeps its open state.
    if (!opts?.silent) setLoading(true)
    try {
      const [tRes, rRes, eRes, settRes] = await Promise.all([
        fetch("/api/kpi/template"),
        fetch("/api/kpi/reviews"),
        isHR ? fetch("/api/employees/active") : Promise.resolve(null),
        isHR ? fetch("/api/kpi/settings") : Promise.resolve(null),
      ])
      const [tData, rData, eData, settData] = await Promise.all([
        tRes.ok ? tRes.json() : { sections: [] },
        rRes.ok ? rRes.json() : [],
        eRes?.ok ? eRes!.json() : [],
        settRes?.ok ? settRes!.json() : null,
      ])
      const revs: Review[] = Array.isArray(rData) ? rData : []
      setTemplate(tData.sections ?? tData)
      setReviews(revs)
      setAllEmployees(Array.isArray(eData) ? eData : [])
      if (settData?.current_period) setCurrentPeriod(settData.current_period)

      if (revs.length > 0) {
        const [scoreResults, tplResults, fcResults] = await Promise.all([
          Promise.all(revs.map(r =>
            fetch(`/api/kpi/reviews/${r.id}/scores`)
              .then(res => res.ok ? res.json() : [])
              .then((data: Score[]) => ({ id: r.id, data }))
          )),
          Promise.all(revs.map(r =>
            fetch(`/api/kpi/reviews/${r.id}/template`)
              .then(res => res.ok ? res.json() : [])
              .then((data: TemplateSection[]) => ({ id: r.id, data }))
          )),
          Promise.all(revs.map(r =>
            fetch(`/api/kpi/reviews/${r.id}/final-comments`)
              .then(res => res.ok ? res.json() : [])
              .then((data: FinalComment[]) => ({ id: r.id, data }))
          )),
        ])
        const smap: Record<string, Score[]> = {}
        scoreResults.forEach(({ id, data }) => { smap[id] = data })
        setScores(smap)
        const tmap: Record<string, TemplateSection[]> = {}
        tplResults.forEach(({ id, data }) => { tmap[id] = Array.isArray(data) ? data : [] })
        setReviewTemplates(tmap)
        const fmap: Record<string, FinalComment[]> = {}
        fcResults.forEach(({ id, data }) => { fmap[id] = Array.isArray(data) ? data : [] })
        setFinalComments(fmap)
      }
    } catch {
      showToast("Failed to load data")
    } finally {
      if (!opts?.silent) setLoading(false)
    }
  }, [isHR])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadAll() }, [loadAll])

  async function handleScoreChange(reviewId: string, itemId: string, score: number | null, comments: string, scorerId: string | null) {
    const res = await fetch(`/api/kpi/reviews/${reviewId}/scores`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: itemId, score, comments, scorer_id: scorerId }),
    })
    if (res.ok) {
      const updated: Score = await res.json()
      setScores(prev => {
        const list = (prev[reviewId] ?? []).filter(s => !(s.item_id === itemId && s.scorer_id === updated.scorer_id))
        return { ...prev, [reviewId]: [...list, updated] }
      })
    } else {
      showToast("Failed to save score — please try again")
    }
  }

  async function handleSaveFinalComment(reviewId: string, authorId: string | null, comment: string) {
    const res = await fetch(`/api/kpi/reviews/${reviewId}/final-comments`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ author_id: authorId, comment }),
    })
    if (res.ok) {
      const updated: FinalComment = await res.json()
      setFinalComments(prev => {
        const list = (prev[reviewId] ?? []).filter(c => (c.author_id ?? "hr") !== (updated.author_id ?? "hr"))
        return { ...prev, [reviewId]: [...list, updated] }
      })
      showToast("Final comment saved")
    } else showToast("Failed to save comment")
  }

  async function handleAddInvitee(reviewId: string, inviteeIds: string[], sendEmail: boolean, sectionIds: string[]) {
    const res = await fetch(`/api/kpi/reviews/${reviewId}/invitees`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitee_ids: inviteeIds, send_email: sendEmail, section_ids: sectionIds }),
    })
    if (res.ok) {
      const data = await res.json().catch(() => null)
      if (sendEmail) showToast(`Reviewers added · ${data?.emailed ?? 0} emailed`)
      else showToast("Reviewers added")
      await loadAll({ silent: true })
    } else showToast("Failed to add reviewers")
  }

  async function handleSetSections(reviewId: string, reviewInviteeId: string, sectionIds: string[]) {
    const res = await fetch(`/api/kpi/reviews/${reviewId}/invitees`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ review_invitee_id: reviewInviteeId, section_ids: sectionIds }),
    })
    if (res.ok) { showToast("Sections updated"); await loadAll({ silent: true }) }
    else showToast("Failed to update sections")
  }

  async function handleRemoveInvitee(reviewId: string, inviteeId: string) {
    const res = await fetch(`/api/kpi/reviews/${reviewId}/invitees`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitee_id: inviteeId }),
    })
    if (res.ok) await loadAll({ silent: true })
    else showToast("Failed to remove invitee")
  }

  async function handleStatusChange(reviewId: string, status: string) {
    const prev = reviews.find(r => r.id === reviewId)?.status
    setReviews(rs => rs.map(r => r.id === reviewId ? { ...r, status: status as Review["status"] } : r))
    const res = await fetch(`/api/kpi/reviews/${reviewId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) {
      if (prev) setReviews(rs => rs.map(r => r.id === reviewId ? { ...r, status: prev } : r))
      showToast("Failed to update status")
    }
  }

  async function handleDeleteReview(reviewId: string) {
    setDeleteTarget(reviewId)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const res = await fetch(`/api/kpi/reviews/${deleteTarget}`, { method: "DELETE" })
    setDeleting(false)
    setDeleteTarget(null)
    if (res.ok) {
      setReviews(prev => prev.filter(r => r.id !== deleteTarget))
      showToast("Review deleted")
    } else {
      showToast("Failed to delete review")
    }
  }

  async function handleAddItem(sectionId: string, data: { title: string; description: string; min_score: number; max_score: number }) {
    const res = await fetch(`/api/kpi/template/sections/${sectionId}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (res.ok) { showToast("KPI item added"); await loadAll({ silent: true }) }
    else showToast("Failed to add KPI item")
  }

  async function handleEditItem(itemId: string, data: { title: string; description: string; min_score: number; max_score: number }) {
    const res = await fetch(`/api/kpi/template/items/${itemId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (res.ok) { showToast("KPI item updated"); await loadAll({ silent: true }) }
    else showToast("Failed to update KPI item")
  }

  async function handleDeleteItem(itemId: string, title: string) {
    if (!window.confirm(`Delete KPI "${title}" from the global template? It will be removed for ALL staff. Existing scores are kept.`)) return
    const res = await fetch(`/api/kpi/template/items/${itemId}`, { method: "DELETE" })
    if (res.ok) { showToast("KPI item deleted"); await loadAll({ silent: true }) }
    else showToast("Failed to delete KPI item")
  }

  // ── Per-review (per-staff) KPI edits ──────────────────────────────────
  async function handleReviewEditItem(reviewId: string, itemId: string, data: { title: string; description: string; min_score: number; max_score: number }) {
    const res = await fetch(`/api/kpi/reviews/${reviewId}/items/${itemId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (res.ok) { showToast("KPI updated for this staff member only"); await loadAll({ silent: true }) }
    else showToast("Failed to update KPI")
  }

  async function handleReviewAddItem(reviewId: string, sectionId: string, data: { title: string; description: string; min_score: number; max_score: number }) {
    const res = await fetch(`/api/kpi/reviews/${reviewId}/items`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section_id: sectionId, ...data }),
    })
    if (res.ok) { showToast("KPI added for this staff member only"); await loadAll({ silent: true }) }
    else showToast("Failed to add KPI")
  }

  async function handleReviewRemoveItem(reviewId: string, itemId: string, title: string) {
    if (!window.confirm(`Remove "${title}" from this staff member's review only? Other staff are unaffected.`)) return
    const res = await fetch(`/api/kpi/reviews/${reviewId}/items/${itemId}?action=remove`, { method: "DELETE" })
    if (res.ok) { showToast("KPI removed for this staff member"); await loadAll({ silent: true }) }
    else showToast("Failed to remove KPI")
  }

  async function handleReviewResetItem(reviewId: string, itemId: string) {
    const res = await fetch(`/api/kpi/reviews/${reviewId}/items/${itemId}?action=reset`, { method: "DELETE" })
    if (res.ok) { showToast("KPI reset to the global template"); await loadAll({ silent: true }) }
    else showToast("Failed to reset KPI")
  }

  async function handleUpdateReviewDetails(reviewId: string, data: { title: string; period: string; deadline: string | null }) {
    const res = await fetch(`/api/kpi/reviews/${reviewId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      setReviews(rs => rs.map(r => r.id === reviewId ? { ...r, ...data } : r))
      showToast("Review details updated")
    } else showToast("Failed to update review details")
  }

  async function handleSetPeriod(value: string) {
    const res = await fetch("/api/kpi/settings", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "current_period", value }),
    })
    if (res.ok) { setCurrentPeriod(value); showToast("Current period updated") }
    else showToast("Failed to update period")
  }

  async function handleCreateSection(title: string, type: "hr" | "invitee") {
    const res = await fetch("/api/kpi/template/sections", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, type }),
    })
    if (res.ok) { showToast("Section added"); await loadAll({ silent: true }) }
    else showToast("Failed to add section")
  }

  async function handleRenameSection(id: string, title: string) {
    const res = await fetch(`/api/kpi/template/sections/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    })
    if (res.ok) { showToast("Section renamed"); await loadAll({ silent: true }) }
    else showToast("Failed to rename section")
  }

  async function handleReorderSection(id: string, direction: "up" | "down") {
    const sorted = [...template].sort((a, b) => a.position - b.position)
    const idx = sorted.findIndex(s => s.id === id)
    const swapIdx = direction === "up" ? idx - 1 : idx + 1
    if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return
    const a = sorted[idx], b = sorted[swapIdx]
    // Swap their positions
    const results = await Promise.all([
      fetch(`/api/kpi/template/sections/${a.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position: b.position }),
      }),
      fetch(`/api/kpi/template/sections/${b.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position: a.position }),
      }),
    ])
    if (results.every(r => r.ok)) await loadAll({ silent: true })
    else showToast("Failed to reorder sections")
  }

  async function handleDeleteSection(id: string, title: string) {
    if (!window.confirm(`Delete section "${title || "(untitled)"}" and all its KPI items? Existing scores are kept but the section will no longer appear in reviews.`)) return
    const res = await fetch(`/api/kpi/template/sections/${id}`, { method: "DELETE" })
    if (res.ok) { showToast("Section deleted"); await loadAll({ silent: true }) }
    else showToast("Failed to delete section")
  }

  async function handleExportTemplate(format: "csv" | "xlsx") {
    const res = await fetch(`/api/kpi/template/export?format=${format}`)
    if (!res.ok) { showToast("Export failed"); return }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `kpi-template.${format}`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function handleImportTemplate(file: File) {
    const fd = new FormData()
    fd.append("file", file)
    const res = await fetch("/api/kpi/template/import", { method: "POST", body: fd })
    const data = await res.json().catch(() => null)
    if (res.ok) {
      showToast(data?.message ?? "Import complete")
      if (Array.isArray(data?.errors) && data.errors.length) console.warn("[KPI import] row errors:", data.errors)
      await loadAll({ silent: true })
    } else {
      showToast(data?.error ?? "Import failed")
    }
  }

  // Staff KPI scores round-trip — export one review (individual) or all at once.
  async function handleExportScores(format: "csv" | "xlsx", reviewId?: string) {
    const qs = new URLSearchParams({ format })
    if (reviewId) qs.set("review_id", reviewId)
    const res = await fetch(`/api/kpi/staff-scores/export?${qs.toString()}`)
    if (!res.ok) {
      const err = await res.json().catch(() => null)
      showToast(err?.error ?? "Export failed")
      return
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${reviewId ? "kpi-scores-review" : "kpi-scores-all"}.${format}`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function handleImportScores(file: File) {
    const fd = new FormData()
    fd.append("file", file)
    const res = await fetch("/api/kpi/staff-scores/import", { method: "POST", body: fd })
    const data = await res.json().catch(() => null)
    if (res.ok) {
      showToast(data?.message ?? "Import complete")
      if (Array.isArray(data?.errors) && data.errors.length) console.warn("[KPI scores import] row errors:", data.errors)
      await loadAll({ silent: true })
    } else {
      showToast(data?.error ?? "Import failed")
    }
  }

  async function handleCreate(d: { employee_id: string; period: string; title: string; deadline: string }) {
    setCreating(true)
    const res = await fetch("/api/kpi/reviews", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(d),
    })
    if (res.ok) { showToast("Review created"); setShowCreate(false); setCreatePreselect({}); await loadAll({ silent: true }) }
    else { const err = await res.json(); showToast(err.error ?? "Failed to create review") }
    setCreating(false)
  }

  function handleShowCreate(employeeId?: string, quarter?: Quarter) {
    setCreatePreselect({ employeeId, quarter })
    setShowCreate(true)
  }

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    ...(isHR ? [{ id: "reviews" as Tab, label: "All Reviews", icon: BarChart3 }] : []),
    { id: "myassignments" as Tab, label: "My Reviews", icon: FileText },
  ]

  return (
    <div className="space-y-0">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-foreground text-background text-sm px-4 py-2.5 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {/* Tab bar — only shown for non-HR (who have only one tab) or when HR is on assignments tab */}
      {(!isHR || tab === "myassignments") && (
        <div className="flex items-center gap-1 mb-6 border-b border-border">
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
        </div>
      )}

      {isHR && tab === "reviews" && (
        <div className="flex items-center gap-1 mb-4">
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
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 size={28} className="animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {tab === "reviews" && isHR && (
            <HRAdminView
              reviewTemplates={reviewTemplates}
              reviews={reviews}
              scores={scores}
              finalComments={finalComments}
              allEmployees={allEmployees}
              currentEmployeeId={currentEmployeeId}
              onScoreChange={handleScoreChange}
              onSaveFinalComment={handleSaveFinalComment}
              onAddInvitee={handleAddInvitee}
              onRemoveInvitee={handleRemoveInvitee}
              onSetSections={handleSetSections}
              onStatusChange={handleStatusChange}
              onDelete={handleDeleteReview}
              onAddItem={handleReviewAddItem}
              onEditItem={handleReviewEditItem}
              onRemoveItem={handleReviewRemoveItem}
              onResetItem={handleReviewResetItem}
              onUpdateReviewDetails={handleUpdateReviewDetails}
              onShowCreate={handleShowCreate}
              onManageTemplate={() => setShowManage(true)}
              onExportScores={handleExportScores}
              onImportScores={handleImportScores}
            />
          )}

          {tab === "myassignments" && (
            <>
              {!isHR && (
                <div className="flex items-start justify-between gap-4 mb-6">
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight">KPI &amp; Performance</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">View your KPI reviews and scoring</p>
                  </div>
                </div>
              )}
              <MyAssignmentsView
                reviews={reviews}
                scores={scores}
                reviewTemplates={reviewTemplates}
                finalComments={finalComments}
                currentEmployeeId={currentEmployeeId}
                isHR={isHR}
                onScoreChange={handleScoreChange}
                onSaveFinalComment={handleSaveFinalComment}
                loadAll={loadAll}
                showToast={showToast}
              />
            </>
          )}
        </>
      )}

      {showCreate && (
        <CreateReviewModal
          employees={allEmployees}
          currentPeriod={currentPeriod}
          preselectedEmployeeId={createPreselect.employeeId}
          preselectedQuarter={createPreselect.quarter}
          onSave={handleCreate}
          onClose={() => { setShowCreate(false); setCreatePreselect({}) }}
          saving={creating}
        />
      )}

      {deleteTarget && (
        <ConfirmDeleteModal
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
          deleting={deleting}
        />
      )}

      {showManage && isHR && (
        <ManageTemplateModal
          template={template}
          currentPeriod={currentPeriod}
          onClose={() => setShowManage(false)}
          onSetPeriod={handleSetPeriod}
          onCreateSection={handleCreateSection}
          onRenameSection={handleRenameSection}
          onReorderSection={handleReorderSection}
          onDeleteSection={handleDeleteSection}
          onExport={handleExportTemplate}
          onImport={handleImportTemplate}
          onAddGlobalItem={handleAddItem}
          onEditGlobalItem={handleEditItem}
          onDeleteGlobalItem={handleDeleteItem}
        />
      )}
    </div>
  )
}
