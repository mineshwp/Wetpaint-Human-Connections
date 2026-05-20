"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { createBrowserClient } from "@supabase/ssr"
import {
  Mail,
  Phone,
  Calendar,
  User,
  ChevronLeft,
  Edit3,
  Printer,
  Eye,
  EyeOff,
  TrendingUp,
  BookOpen,
  FileText,
  Download,
  Clock,
  Plus,
  AlertTriangle,
  X,
  ChevronDown,
  ChevronUp,
  Trash2,
  ExternalLink,
  Check,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type {
  EmployeeFull,
  LeaveBalance,
  EmployeeDocument,
  HRNote,
  KpiSummary,
  EmploymentStatus,
  EmployeeTraining,
  TrainingCategory,
} from "@/lib/types"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function tenure(startDate: string | null | undefined): string {
  if (!startDate) return "—"
  const start = new Date(startDate)
  const now = new Date()
  const months =
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth())
  if (months < 1) return "< 1 month"
  if (months < 12) return `${months}m`
  const years = Math.floor(months / 12)
  const rem = months % 12
  return rem > 0 ? `${years}y ${rem}m` : `${years}y`
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const CATEGORY_LABELS: Record<string, string> = {
  contract: "Contract",
  id: "ID Document",
  payslip: "Payslip",
  kpi: "KPI",
  training: "Training",
  offer_letter: "Offer Letter",
  tax: "Tax / SARS",
  qualification: "Qualification",
  sick_note: "Sick Note",
  onboarding_doc: "Onboarding",
  other: "Other",
}

function escHtml(s: string | null | undefined): string {
  if (!s) return ""
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

const TRAINING_CATEGORY_LABELS: Record<TrainingCategory, string> = {
  technical: "Technical",
  compliance: "Compliance",
  leadership: "Leadership",
  safety: "Safety",
  "soft-skills": "Soft Skills",
  other: "Other",
}

const STATUS_META: Record<
  EmploymentStatus,
  { label: string; fg: string; bg: string }
> = {
  active: { label: "Active", fg: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  onboarding: { label: "Onboarding", fg: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
  "on-leave": { label: "On Leave", fg: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
  terminated: { label: "Terminated", fg: "text-gray-500", bg: "bg-gray-50 border-gray-200" },
  suspended: { label: "Suspended", fg: "text-red-700", bg: "bg-red-50 border-red-200" },
  resigned: { label: "Resigned", fg: "text-purple-700", bg: "bg-purple-50 border-purple-200" },
}

function StatusBadge({ status }: { status: EmploymentStatus }) {
  const m = STATUS_META[status]
  return (
    <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold", m.fg, m.bg)}>
      {m.label}
    </span>
  )
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function SectionCard({
  title,
  subtitle,
  children,
  padded = true,
  action,
}: {
  title?: string
  subtitle?: string
  children: React.ReactNode
  padded?: boolean
  action?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card">
      {(title || subtitle || action) && (
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
          <div>
            {title && <p className="text-sm font-semibold text-foreground">{title}</p>}
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={padded ? "p-5" : ""}>{children}</div>
    </div>
  )
}

function FieldRow({
  label,
  value,
  sensitive = false,
}: {
  label: string
  value?: string | null
  sensitive?: boolean
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground w-40 shrink-0">{label}</span>
      {value ? (
        <span className="text-sm font-medium flex items-center gap-2">
          {sensitive && !show ? "••••••••••" : value}
          {sensitive && (
            <button
              onClick={() => setShow((v) => !v)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label={show ? "Hide" : "Show"}
            >
              {show ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          )}
        </span>
      ) : (
        <span className="text-sm text-muted-foreground italic">Not provided</span>
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap",
        active
          ? "text-white"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
      style={active ? { background: "var(--brand-primary)" } : undefined}
    >
      {children}
    </button>
  )
}

// ─── Inline edit helpers ───────────────────────────────────────────────────────

function EditableField({
  label,
  value,
  field,
  type = "text",
  placeholder,
}: {
  label: string
  value: string
  field: string
  type?: string
  placeholder?: string
}) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border last:border-0">
      <label className="text-sm text-muted-foreground w-40 shrink-0 pt-1.5">{label}</label>
      <input
        name={field}
        type={type}
        defaultValue={value}
        placeholder={placeholder ?? label}
        className="flex-1 text-sm border border-border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring/30 bg-background"
      />
    </div>
  )
}

// ─── Tab 1: Personal & Employment ────────────────────────────────────────────

function PersonalTab({
  emp,
  isHR,
  isOwnProfile,
}: {
  emp: EmployeeFull
  isHR: boolean
  isOwnProfile: boolean
}) {
  const [editingContact, setEditingContact] = useState(false)
  const [editingNok, setEditingNok] = useState(false)
  const [saving, setSaving] = useState<"contact" | "nok" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [localEmp, setLocalEmp] = useState(emp)

  const canEditOwn = isOwnProfile && !isHR

  async function saveSection(
    section: "contact" | "nok",
    formData: FormData
  ) {
    setSaving(section)
    setError(null)
    const body: Record<string, string> = {}
    formData.forEach((v, k) => { body[k] = v.toString() })

    const res = await fetch(`/api/employees/${emp.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    setSaving(null)
    if (!res.ok) {
      setError("Failed to save changes.")
      return
    }
    if (section === "contact") {
      setLocalEmp((prev) => ({
        ...prev,
        phone: body.phone || null,
        alternatePhone: body.alternate_phone || null,
        personalEmail: body.personal_email || null,
      }))
      setEditingContact(false)
    } else {
      setLocalEmp((prev) => ({
        ...prev,
        nextOfKinName: body.next_of_kin_name || null,
        nextOfKinPhone: body.next_of_kin_phone || null,
        nextOfKinRelationship: body.next_of_kin_relationship || null,
      }))
      setEditingNok(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <SectionCard title="Personal Information" subtitle="Identity & EE data">
        <FieldRow label="First Name" value={localEmp.firstName} />
        <FieldRow label="Surname" value={localEmp.lastName} />
        <FieldRow label="Gender" value={localEmp.gender} />
        {isHR && <FieldRow label="Date of Birth" value={fmtDate(localEmp.dateOfBirth)} />}
        {isHR && <FieldRow label="Identity Number" value={localEmp.identityNumber} sensitive />}
        {isHR && <FieldRow label="Race (EE)" value={localEmp.race} />}
        {isHR && <FieldRow label="Disability" value={localEmp.disability} />}
        {isHR && <FieldRow label="Citizenship" value={localEmp.citizenshipStatus} />}
        {isHR && <FieldRow label="VAT / Tax Ref" value={localEmp.vatNumber} />}
      </SectionCard>

      <SectionCard
        title="Contact Details"
        subtitle="Phone, email & address"
        action={
          canEditOwn && !editingContact ? (
            <button
              onClick={() => setEditingContact(true)}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-border hover:bg-muted transition-colors text-muted-foreground"
            >
              <Edit3 size={12} />
              Edit
            </button>
          ) : undefined
        }
      >
        {error && editingContact && (
          <p className="text-xs text-red-600 mb-3">{error}</p>
        )}
        {editingContact ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              saveSection("contact", new FormData(e.currentTarget))
            }}
          >
            <EditableField label="Cell Phone" value={localEmp.phone ?? ""} field="phone" type="tel" />
            <EditableField label="Alternate Number" value={localEmp.alternatePhone ?? ""} field="alternate_phone" type="tel" />
            <EditableField label="Personal Email" value={localEmp.personalEmail ?? ""} field="personal_email" type="email" />
            <div className="flex justify-end gap-2 pt-3">
              <button
                type="button"
                onClick={() => setEditingContact(false)}
                className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving === "contact"}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white rounded-lg disabled:opacity-50 transition-opacity"
                style={{ background: "var(--brand-primary)" }}
              >
                {saving === "contact" ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                Save
              </button>
            </div>
          </form>
        ) : (
          <>
            <FieldRow label="Cell Phone" value={localEmp.phone} />
            <FieldRow label="Alternate Number" value={localEmp.alternatePhone} />
            <FieldRow label="Personal Email" value={localEmp.personalEmail} />
            <FieldRow label="Work Email" value={localEmp.workEmail ?? localEmp.email} />
            {isHR && <FieldRow label="Home Address" value={localEmp.homeAddress} />}
          </>
        )}
      </SectionCard>

      <SectionCard
        title="Next of Kin"
        subtitle="Emergency contact"
        action={
          canEditOwn && !editingNok ? (
            <button
              onClick={() => setEditingNok(true)}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-border hover:bg-muted transition-colors text-muted-foreground"
            >
              <Edit3 size={12} />
              Edit
            </button>
          ) : undefined
        }
      >
        {error && editingNok && (
          <p className="text-xs text-red-600 mb-3">{error}</p>
        )}
        {editingNok ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              saveSection("nok", new FormData(e.currentTarget))
            }}
          >
            <EditableField label="Name" value={localEmp.nextOfKinName ?? ""} field="next_of_kin_name" placeholder="Full name" />
            <EditableField label="Contact Number" value={localEmp.nextOfKinPhone ?? ""} field="next_of_kin_phone" type="tel" />
            <EditableField label="Relationship" value={localEmp.nextOfKinRelationship ?? ""} field="next_of_kin_relationship" placeholder="e.g. Spouse, Parent" />
            <div className="flex justify-end gap-2 pt-3">
              <button
                type="button"
                onClick={() => setEditingNok(false)}
                className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving === "nok"}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white rounded-lg disabled:opacity-50 transition-opacity"
                style={{ background: "var(--brand-primary)" }}
              >
                {saving === "nok" ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                Save
              </button>
            </div>
          </form>
        ) : (
          <>
            <FieldRow label="Name" value={localEmp.nextOfKinName} />
            <FieldRow label="Contact Number" value={localEmp.nextOfKinPhone} />
            <FieldRow label="Relationship" value={localEmp.nextOfKinRelationship} />
          </>
        )}
      </SectionCard>

      <SectionCard title="Employment Details" subtitle="Role, contract & reporting">
        <FieldRow label="Staff Number" value={localEmp.employeeNumber} />
        <FieldRow label="Job Title" value={localEmp.jobTitle} />
        <FieldRow label="Department" value={localEmp.department?.name} />
        <FieldRow
          label="Contract Type"
          value={
            localEmp.contractType
              ? localEmp.contractType.charAt(0).toUpperCase() + localEmp.contractType.slice(1)
              : null
          }
        />
        <FieldRow label="Start Date" value={fmtDate(localEmp.startDate)} />
        {localEmp.contractEndDate && (
          <FieldRow label="Contract End" value={fmtDate(localEmp.contractEndDate)} />
        )}
        {localEmp.probationEndDate && (
          <FieldRow label="Probation End" value={fmtDate(localEmp.probationEndDate)} />
        )}
        {isHR && localEmp.lastSalaryReviewDate && (
          <FieldRow label="Last Pay Review" value={fmtDate(localEmp.lastSalaryReviewDate)} />
        )}
      </SectionCard>
    </div>
  )
}

// ─── Tab 2: Banking & Payroll ─────────────────────────────────────────────────

function BankingTab({ emp }: { emp: EmployeeFull }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <SectionCard title="Banking Details" subtitle="Salary payment information">
        <FieldRow label="Bank" value={emp.bankName} />
        <FieldRow label="Account Number" value={emp.bankAccountNumber} sensitive />
        <FieldRow label="Branch Code" value={emp.bankBranchCode} />
        <FieldRow
          label="Account Type"
          value={
            emp.bankAccountType
              ? emp.bankAccountType.charAt(0).toUpperCase() + emp.bankAccountType.slice(1)
              : null
          }
        />
        <FieldRow label="Verification Status" value={emp.bankVerificationStatus} />
      </SectionCard>

      <SectionCard title="Payroll" subtitle="Pay reviews and tax reference">
        <FieldRow label="Last Pay Review" value={fmtDate(emp.lastSalaryReviewDate)} />
        <FieldRow label="Salary Band" value={emp.salaryBand} />
        <FieldRow label="VAT / Tax Ref" value={emp.vatNumber} />
      </SectionCard>
    </div>
  )
}

// ─── KPI inline detail ────────────────────────────────────────────────────────

type KpiSection = {
  id: string
  title: string
  type: string
  position: number
  kpi_template_items: {
    id: string
    title: string
    description: string | null
    min_score: number
    max_score: number
    position: number
  }[]
}

type KpiScore = {
  id: string
  item_id: string
  scorer_id: string | null
  score: number | null
  comments: string | null
}

function templateForKpiReview(sections: KpiSection[], scores: KpiScore[]) {
  const scoredItemIds = new Set(scores.map((score) => score.item_id))

  return sections.map((section) => {
    const items = section.kpi_template_items ?? []
    const scoredItems = items.filter((item) => scoredItemIds.has(item.id))

    return {
      ...section,
      kpi_template_items: section.position === 1 && scoredItems.length > 0 ? scoredItems : items,
    }
  })
}

function KpiDetailPanel({ reviewId }: { reviewId: string }) {
  const [sections, setSections] = useState<KpiSection[]>([])
  const [scores, setScores] = useState<KpiScore[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [tplRes, scoresRes] = await Promise.all([
          fetch("/api/kpi/template"),
          fetch(`/api/kpi/reviews/${reviewId}/scores`),
        ])
        if (!tplRes.ok || !scoresRes.ok) throw new Error("Failed to load")
        const [tpl, sc] = await Promise.all([tplRes.json(), scoresRes.json()])
        const nextScores = sc ?? []
        setSections(templateForKpiReview(tpl.sections ?? tpl ?? [], nextScores))
        setScores(nextScores)
      } catch {
        setError("Could not load KPI details.")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [reviewId])

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 size={14} className="animate-spin" />
        Loading KPI details…
      </div>
    )
  }

  if (error) {
    return <p className="text-sm text-red-600 py-4">{error}</p>
  }

  function avgScore(itemId: string) {
    const itemScores = scores.filter((s) => s.item_id === itemId && s.score !== null)
    if (itemScores.length === 0) return null
    return itemScores.reduce((sum, s) => sum + (s.score ?? 0), 0) / itemScores.length
  }

  function sectionTotal(sec: KpiSection) {
    return sec.kpi_template_items.reduce((sum, item) => {
      const avg = avgScore(item.id)
      return sum + (avg ?? 0)
    }, 0)
  }

  const overallTotal = sections.reduce((sum, sec) => sum + sectionTotal(sec), 0)

  return (
    <div className="mt-4 space-y-4">
      {sections.map((sec) => (
        <div key={sec.id} className="rounded-lg border border-border overflow-hidden">
          <div className="px-4 py-2.5 bg-muted/40 flex items-center justify-between">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
              {sec.title}
            </p>
            <p className="text-xs font-semibold text-muted-foreground">
              Section total: {sectionTotal(sec).toFixed(1)}
            </p>
          </div>
          <div className="divide-y divide-border">
            {sec.kpi_template_items
              .sort((a, b) => a.position - b.position)
              .map((item) => {
                const avg = avgScore(item.id)
                return (
                  <div key={item.id} className="px-4 py-3 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{item.title}</p>
                      {item.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      {avg !== null ? (
                        <span className="text-sm font-semibold text-foreground">
                          {avg.toFixed(1)}
                          <span className="text-xs text-muted-foreground font-normal ml-0.5">
                            /{item.max_score}
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Not scored</span>
                      )}
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      ))}
      {sections.length > 0 && (
        <div className="flex justify-end">
          <div className="rounded-lg border border-border px-4 py-2.5 text-sm">
            <span className="text-muted-foreground">Overall score: </span>
            <span className="font-bold text-foreground">{overallTotal.toFixed(1)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Training add/edit modal ──────────────────────────────────────────────────

type TrainingFormData = {
  name: string
  type: "online" | "in-person"
  provider: string
  category: string
  url: string
  venue: string
  date_completed: string
  expiry_date: string
  duration_hours: string
  notes: string
}

const BLANK_FORM: TrainingFormData = {
  name: "",
  type: "in-person",
  provider: "",
  category: "",
  url: "",
  venue: "",
  date_completed: "",
  expiry_date: "",
  duration_hours: "",
  notes: "",
}

function TrainingModal({
  employeeId,
  editing,
  onClose,
  onSaved,
}: {
  employeeId: string
  editing: EmployeeTraining | null
  onClose: () => void
  onSaved: (record: EmployeeTraining) => void
}) {
  const [form, setForm] = useState<TrainingFormData>(
    editing
      ? {
          name: editing.name,
          type: editing.type,
          provider: editing.provider ?? "",
          category: editing.category ?? "",
          url: editing.url ?? "",
          venue: editing.venue ?? "",
          date_completed: editing.date_completed ?? "",
          expiry_date: editing.expiry_date ?? "",
          duration_hours: editing.duration_hours?.toString() ?? "",
          notes: editing.notes ?? "",
        }
      : BLANK_FORM
  )
  const [certFile, setCertFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  function set(key: keyof TrainingFormData, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function uploadCert(file: File): Promise<string | null> {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const ext = file.name.split(".").pop()
    const path = `${employeeId}/${Date.now()}.${ext}`
    const { error } = await supabase.storage
      .from("training-certificates")
      .upload(path, file, { upsert: false })
    if (error) return null
    const { data } = supabase.storage.from("training-certificates").getPublicUrl(path)
    return data.publicUrl
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      setError("Training name is required.")
      return
    }
    setSaving(true)
    setError(null)

    let certUrl = editing?.certificate_url ?? null
    if (certFile) {
      certUrl = await uploadCert(certFile)
      if (!certUrl) {
        setError("Certificate upload failed. Try again.")
        setSaving(false)
        return
      }
    }

    const body = {
      ...form,
      duration_hours: form.duration_hours ? Number(form.duration_hours) : null,
      certificate_url: certUrl,
    }

    const url = editing
      ? `/api/employees/${employeeId}/training/${editing.id}`
      : `/api/employees/${employeeId}/training`
    const method = editing ? "PATCH" : "POST"

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    setSaving(false)
    if (!res.ok) {
      setError("Failed to save. Please try again.")
      return
    }
    const saved = await res.json()
    onSaved(saved)
    onClose()
  }

  const labelClass = "block text-xs font-medium text-muted-foreground mb-1"
  const inputClass =
    "w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring/30 bg-background"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-card rounded-xl border border-border shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <p className="text-sm font-semibold">{editing ? "Edit Training" : "Add Training"}</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className={labelClass}>Training Name *</label>
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. First Aid Level 1"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Type *</label>
              <select
                className={inputClass}
                value={form.type}
                onChange={(e) => set("type", e.target.value as "online" | "in-person")}
              >
                <option value="in-person">In-person</option>
                <option value="online">Online</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Category</label>
              <select
                className={inputClass}
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
              >
                <option value="">— Select —</option>
                {(Object.keys(TRAINING_CATEGORY_LABELS) as TrainingCategory[]).map((k) => (
                  <option key={k} value={k}>
                    {TRAINING_CATEGORY_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>Provider / Institution</label>
            <input
              className={inputClass}
              value={form.provider}
              onChange={(e) => set("provider", e.target.value)}
              placeholder="e.g. Coursera, UNISA, Red Cross"
            />
          </div>

          {form.type === "online" ? (
            <div>
              <label className={labelClass}>Course URL</label>
              <input
                className={inputClass}
                type="url"
                value={form.url}
                onChange={(e) => set("url", e.target.value)}
                placeholder="https://…"
              />
            </div>
          ) : (
            <div>
              <label className={labelClass}>Venue</label>
              <input
                className={inputClass}
                value={form.venue}
                onChange={(e) => set("venue", e.target.value)}
                placeholder="e.g. Cape Town Training Centre"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Date Completed</label>
              <input
                className={inputClass}
                type="date"
                value={form.date_completed}
                onChange={(e) => set("date_completed", e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Expiry Date</label>
              <input
                className={inputClass}
                type="date"
                value={form.expiry_date}
                onChange={(e) => set("expiry_date", e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Duration (hours)</label>
            <input
              className={inputClass}
              type="number"
              min="0"
              step="0.5"
              value={form.duration_hours}
              onChange={(e) => set("duration_hours", e.target.value)}
              placeholder="e.g. 8"
            />
          </div>

          <div>
            <label className={labelClass}>Certificate</label>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={(e) => setCertFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-border file:text-xs file:font-medium file:bg-muted file:text-foreground hover:file:bg-muted/80 cursor-pointer"
            />
            {editing?.certificate_url && !certFile && (
              <p className="text-xs text-muted-foreground mt-1">
                Certificate on file.{" "}
                <a
                  href={editing.certificate_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                  style={{ color: "var(--brand-primary)" }}
                >
                  View
                </a>
                {" — "}upload a new file to replace.
              </p>
            )}
          </div>

          <div>
            <label className={labelClass}>Notes</label>
            <textarea
              className={cn(inputClass, "resize-none")}
              rows={3}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Any additional context…"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 transition-opacity"
              style={{ background: "var(--brand-primary)" }}
            >
              {saving && <Loader2 size={13} className="animate-spin" />}
              {saving ? "Saving…" : editing ? "Save Changes" : "Add Training"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Tab 3: Training & KPIs ───────────────────────────────────────────────────

function TrainingKPITab({
  kpi,
  employeeId,
  initialTraining,
  canEdit,
}: {
  kpi: KpiSummary
  employeeId: string
  initialTraining: EmployeeTraining[]
  canEdit: boolean
}) {
  const [nowMs] = useState(() => Date.now())
  const [kpiExpanded, setKpiExpanded] = useState(false)
  const [training, setTraining] = useState(initialTraining)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<EmployeeTraining | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const STATUS_COLOR: Record<string, string> = {
    draft: "text-gray-500 bg-gray-50 border-gray-200",
    active: "text-blue-700 bg-blue-50 border-blue-200",
    completed: "text-emerald-700 bg-emerald-50 border-emerald-200",
  }

  function handleSaved(record: EmployeeTraining) {
    setTraining((prev) => {
      const exists = prev.find((t) => t.id === record.id)
      if (exists) return prev.map((t) => (t.id === record.id ? record : t))
      return [record, ...prev]
    })
    setEditing(null)
  }

  async function deleteTraining(id: string) {
    setDeletingId(id)
    const res = await fetch(`/api/employees/${employeeId}/training/${id}`, {
      method: "DELETE",
    })
    setDeletingId(null)
    if (res.ok) {
      setTraining((prev) => prev.filter((t) => t.id !== id))
    }
  }

  const categoryBadgeColors: Record<string, string> = {
    technical: "text-blue-700 bg-blue-50 border-blue-200",
    compliance: "text-amber-700 bg-amber-50 border-amber-200",
    leadership: "text-violet-700 bg-violet-50 border-violet-200",
    safety: "text-red-700 bg-red-50 border-red-200",
    "soft-skills": "text-emerald-700 bg-emerald-50 border-emerald-200",
    other: "text-gray-600 bg-gray-50 border-gray-200",
  }

  return (
    <div className="space-y-6">
      {/* KPI section */}
      {kpi ? (
        <SectionCard title={`KPI — ${kpi.period}`} subtitle={kpi.title}>
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <span
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold capitalize",
                STATUS_COLOR[kpi.status] ?? "text-gray-500 bg-gray-50 border-gray-200"
              )}
            >
              {kpi.status}
            </span>
            {kpi.deadline && (
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Calendar size={12} />
                Deadline: {fmtDate(kpi.deadline)}
              </span>
            )}
          </div>
          <button
            onClick={() => setKpiExpanded((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-medium hover:underline"
            style={{ color: "var(--brand-primary)" }}
          >
            {kpiExpanded ? "Hide KPI details" : "View KPI details"}
            {kpiExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {kpiExpanded && <KpiDetailPanel reviewId={kpi.reviewId} />}
        </SectionCard>
      ) : (
        <SectionCard>
          <div className="text-center py-8">
            <TrendingUp size={36} className="mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No KPI reviews found.</p>
            <Link
              href="/kpi"
              className="text-sm font-medium hover:underline mt-2 inline-block"
              style={{ color: "var(--brand-primary)" }}
            >
              Go to KPI Reviews →
            </Link>
          </div>
        </SectionCard>
      )}

      {/* Training section */}
      <SectionCard
        title="Training"
        subtitle="Courses and certifications"
        action={
          canEdit ? (
            <button
              onClick={() => { setEditing(null); setShowModal(true) }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white rounded-lg transition-opacity hover:opacity-90"
              style={{ background: "var(--brand-primary)" }}
            >
              <Plus size={14} />
              Add
            </button>
          ) : undefined
        }
        padded={training.length === 0}
      >
        {training.length === 0 ? (
          <div className="text-center py-8">
            <BookOpen size={36} className="mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No training records yet.</p>
            {canEdit && (
              <button
                onClick={() => { setEditing(null); setShowModal(true) }}
                className="text-sm font-medium hover:underline mt-2 inline-block"
                style={{ color: "var(--brand-primary)" }}
              >
                Add first training record →
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {training.map((t) => {
              const isExpired =
                t.expiry_date && new Date(t.expiry_date).getTime() < nowMs
              const isExpiringSoon =
                t.expiry_date &&
                !isExpired &&
                (new Date(t.expiry_date).getTime() - nowMs) / 86_400_000 <= 30

              return (
                <div key={t.id} className="px-5 py-4 flex gap-4 items-start">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-foreground">{t.name}</p>
                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                          t.type === "online"
                            ? "text-blue-700 bg-blue-50 border-blue-200"
                            : "text-gray-600 bg-gray-50 border-gray-200"
                        )}
                      >
                        {t.type === "online" ? "Online" : "In-person"}
                      </span>
                      {t.category && (
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                            categoryBadgeColors[t.category] ?? "text-gray-600 bg-gray-50 border-gray-200"
                          )}
                        >
                          {TRAINING_CATEGORY_LABELS[t.category as TrainingCategory] ?? t.category}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                      {t.provider && <span>{t.provider}</span>}
                      {t.date_completed && (
                        <span className="flex items-center gap-1">
                          <Calendar size={10} />
                          Completed {fmtDate(t.date_completed)}
                        </span>
                      )}
                      {t.duration_hours && (
                        <span className="flex items-center gap-1">
                          <Clock size={10} />
                          {t.duration_hours}h
                        </span>
                      )}
                      {t.expiry_date && (
                        <span
                          className={cn(
                            "flex items-center gap-1",
                            isExpired
                              ? "text-red-600 font-medium"
                              : isExpiringSoon
                              ? "text-amber-600 font-medium"
                              : ""
                          )}
                        >
                          {isExpired ? "⚠ Expired " : isExpiringSoon ? "⚠ Expires " : "Expires "}
                          {fmtDate(t.expiry_date)}
                        </span>
                      )}
                    </div>

                    {t.notes && (
                      <p className="text-xs text-muted-foreground mt-1.5 italic">{t.notes}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {(t.url || t.certificate_url) && (
                      <a
                        href={t.certificate_url ?? t.url ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={t.certificate_url ? "View certificate" : "Open course"}
                        className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                    {canEdit && (
                      <>
                        <button
                          onClick={() => { setEditing(t); setShowModal(true) }}
                          aria-label="Edit training record"
                          className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          onClick={() => deleteTraining(t.id)}
                          disabled={deletingId === t.id}
                          aria-label="Delete training record"
                          className="p-1.5 rounded-md hover:bg-red-50 transition-colors text-muted-foreground hover:text-red-600 disabled:opacity-50"
                        >
                          {deletingId === t.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Trash2 size={14} />
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>

      {showModal && (
        <TrainingModal
          employeeId={employeeId}
          editing={editing}
          onClose={() => { setShowModal(false); setEditing(null) }}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}

// ─── Tab 4: Documents ─────────────────────────────────────────────────────────

function DocumentsTab({
  initialDocs,
  isHR,
}: {
  initialDocs: EmployeeDocument[]
  isHR: boolean
}) {
  const [docs, setDocs] = useState(initialDocs)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function toggleVisibility(docId: string, current: boolean) {
    setTogglingId(docId)
    setError(null)
    const res = await fetch(`/api/documents/${docId}/visibility`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hidden_from_employee: !current }),
    })
    setTogglingId(null)
    if (res.ok) {
      setDocs((prev) =>
        prev.map((d) =>
          d.id === docId ? { ...d, hidden_from_employee: !current } : d
        )
      )
    } else {
      setError("Failed to update visibility.")
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {docs.length === 0 ? (
        <SectionCard>
          <div className="text-center py-12">
            <FileText size={40} className="mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
          </div>
        </SectionCard>
      ) : (
        <SectionCard padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Document</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Category</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">Uploaded</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">Size</th>
                  {isHR && (
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Staff Visibility</th>
                  )}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {docs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileText size={14} className="text-muted-foreground shrink-0" />
                        <span className="font-medium text-foreground">{doc.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold text-blue-700 bg-blue-50 border-blue-200">
                        {CATEGORY_LABELS[doc.category] ?? doc.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">
                      {fmtDate(doc.created_at)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                      {formatBytes(doc.file_size)}
                    </td>
                    {isHR && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleVisibility(doc.id, doc.hidden_from_employee)}
                          disabled={togglingId === doc.id}
                          className={cn(
                            "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border transition-colors disabled:opacity-50",
                            doc.hidden_from_employee
                              ? "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
                              : "bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100"
                          )}
                        >
                          {doc.hidden_from_employee ? <EyeOff size={12} /> : <Eye size={12} />}
                          {doc.hidden_from_employee ? "Hidden" : "Visible"}
                        </button>
                      </td>
                    )}
                    <td className="px-4 py-3 text-right">
                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs font-medium hover:underline"
                        style={{ color: "var(--brand-primary)" }}
                      >
                        <Download size={12} />
                        Download
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  )
}

// ─── Tab 5: HR Notes ──────────────────────────────────────────────────────────

function HRNotesTab({
  initialNotes,
  employeeId,
}: {
  initialNotes: HRNote[]
  employeeId: string
}) {
  const [notes, setNotes] = useState(initialNotes)
  const [newNote, setNewNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function saveNote() {
    const text = newNote.trim()
    if (!text) return
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/employees/${employeeId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: text }),
    })
    setSaving(false)
    if (res.ok) {
      const json = await res.json()
      setNotes((prev) => [json.note, ...prev])
      setNewNote("")
    } else {
      setError("Failed to save note.")
    }
  }

  return (
    <SectionCard title="HR Notes" subtitle="Private — visible to HR only">
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <textarea
        value={newNote}
        onChange={(e) => setNewNote(e.target.value)}
        placeholder="Add a private note…"
        rows={3}
        className="w-full text-sm border border-border rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-ring/30 bg-background"
      />
      <div className="flex justify-end mt-2 mb-6">
        <button
          onClick={saveNote}
          disabled={saving || !newNote.trim()}
          className="flex items-center gap-2 px-4 py-2 text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
          style={{ background: "var(--brand-primary)" }}
        >
          <Plus size={14} />
          {saving ? "Saving…" : "Add Note"}
        </button>
      </div>

      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No notes yet.</p>
      ) : (
        <div className="space-y-3">
          {notes.map((n) => (
            <div key={n.id} className="p-3 bg-muted rounded-lg">
              <p className="text-sm">{n.note}</p>
              <p className="text-xs text-muted-foreground mt-1">{fmtDate(n.created_at)}</p>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

// ─── Profile completeness (HR only) ──────────────────────────────────────────

function profileCompleteness(emp: EmployeeFull): { pct: number; missing: string[] } {
  const fields: [string, unknown][] = [
    ["Phone number", emp.phone],
    ["Personal email", emp.personalEmail],
    ["Date of birth", emp.dateOfBirth],
    ["Identity number", emp.identityNumber],
    ["Home address", emp.homeAddress],
    ["Gender", emp.gender],
    ["Next of kin name", emp.nextOfKinName],
    ["Next of kin phone", emp.nextOfKinPhone],
    ["Bank details", emp.bankName],
    ["Profile photo", emp.profilePhotoUrl],
  ]
  const missing = fields.filter(([, v]) => !v).map(([label]) => label)
  const pct = Math.round(((fields.length - missing.length) / fields.length) * 100)
  return { pct, missing }
}

// ─── Print ────────────────────────────────────────────────────────────────────

const LEAVE_LABELS: Record<string, string> = {
  annual: "Annual Leave",
  sick: "Sick Leave",
  family: "Family Responsibility",
  study: "Study Leave",
  unpaid: "Unpaid Leave",
  recess: "Recess Leave",
  other: "Other",
}

function buildPrintHTML(emp: EmployeeFull, leaveBalances: LeaveBalance[]): string {
  const now = new Date().toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
  const statusColors: Record<string, string> = {
    active: "background:#dcfce7;color:#166534",
    onboarding: "background:#dbeafe;color:#1e40af",
    "on-leave": "background:#fef9c3;color:#854d0e",
    suspended: "background:#fee2e2;color:#991b1b",
    terminated: "background:#f3f4f6;color:#6b7280",
    resigned: "background:#f3e8ff;color:#7e22ce",
  }
  const leaveRows =
    leaveBalances.length > 0
      ? leaveBalances
          .map((b) => {
            const rem = (b.entitled - b.used - b.pending).toFixed(1)
            return `<tr><td>${LEAVE_LABELS[b.leave_type] ?? b.leave_type}</td>
            <td style="text-align:center">${b.entitled}</td>
            <td style="text-align:center">${b.used}</td>
            <td style="text-align:center">${b.pending || "—"}</td>
            <td style="text-align:center;font-weight:600">${rem}</td></tr>`
          })
          .join("")
      : `<tr><td colspan="5" style="text-align:center;color:#9ca3af;font-style:italic">No leave balances on record</td></tr>`

  const f = (label: string, val: string | null | undefined) => `
    <div class="field">
      <span class="fl">${escHtml(label)}</span>
      <span class="${val ? "fv" : "fe"}">${val ? escHtml(val) : "Not provided"}</span>
    </div>`

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
  <title>Employee Record — ${escHtml(emp.firstName)} ${escHtml(emp.lastName)}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11.5px;color:#111827;background:#fff}
    .page{max-width:210mm;margin:0 auto;padding:18mm 20mm}
    .header{display:flex;justify-content:space-between;margin-bottom:20px;padding-bottom:14px;border-bottom:2px solid #111827}
    .co-name{font-size:17px;font-weight:700}.co-sub{font-size:10px;color:#6b7280;margin-top:2px}
    .confidential{font-size:10px;font-weight:700;color:#b91c1c;text-align:right;text-transform:uppercase;letter-spacing:.06em;line-height:1.6}
    .banner{display:flex;gap:16px;margin-bottom:22px;padding:14px 16px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb}
    .avatar{width:56px;height:56px;border-radius:50%;background:#111827;display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;font-weight:700;flex-shrink:0}
    .emp-name{font-size:19px;font-weight:700}.emp-title{font-size:12px;color:#6b7280;margin-top:3px}
    .status{display:inline-block;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:2px 9px;border-radius:9999px;margin-top:7px}
    .section{margin-bottom:18px;break-inside:avoid}
    .section-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;margin-bottom:7px;padding-bottom:4px;border-bottom:1px solid #e5e7eb}
    .two-col{display:grid;grid-template-columns:1fr 1fr;column-gap:24px}
    .field{display:flex;gap:8px;padding:3.5px 0;border-bottom:1px solid #f3f4f6}.field:last-child{border-bottom:none}
    .fl{color:#9ca3af;min-width:130px;flex-shrink:0;font-size:11px}.fv{font-weight:500;font-size:11px}.fe{color:#d1d5db;font-style:italic;font-size:11px}
    table{width:100%;border-collapse:collapse;font-size:11px;margin-top:4px}
    th{text-align:left;padding:5px 8px;background:#f3f4f6;font-weight:600;border:1px solid #e5e7eb;font-size:10.5px}
    td{padding:4.5px 8px;border:1px solid #e5e7eb}
    .footer{margin-top:28px;padding-top:10px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:9.5px;color:#9ca3af}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body><div class="page">
  <div class="header"><div><div class="co-name">Wetpaint Advertising (Pty) Ltd</div><div class="co-sub">Employee Record — HR Administration</div></div>
  <div class="confidential">Confidential<br/>HR Use Only<br/>Do Not Distribute</div></div>
  <div class="banner"><div class="avatar">${escHtml(emp.avatarInitials)}</div><div>
  <div class="emp-name">${escHtml(emp.firstName)} ${escHtml(emp.lastName)}</div>
  <div class="emp-title">${escHtml(emp.jobTitle)}${emp.department ? ` · ${escHtml(emp.department.name)}` : ""}</div>
  <div class="status" style="${escHtml(statusColors[emp.status])}">${escHtml(emp.status.replace("-", " "))}</div>
  </div></div>
  <div class="section"><div class="section-title">Personal Information</div><div class="two-col">
  <div>${f("First Name", emp.firstName)}${f("Surname", emp.lastName)}${f("Date of Birth", fmtDate(emp.dateOfBirth))}${f("Identity Number", emp.identityNumber)}${f("Gender", emp.gender)}</div>
  <div>${f("Race (EE)", emp.race)}${f("Disability", emp.disability)}${f("Citizenship", emp.citizenshipStatus)}${f("VAT / Tax Ref", emp.vatNumber)}</div>
  </div></div>
  <div class="section"><div class="section-title">Contact Details</div><div class="two-col">
  <div>${f("Cell Phone", emp.phone)}${f("Alternate", emp.alternatePhone)}${f("Personal Email", emp.personalEmail)}${f("Work Email", emp.workEmail ?? emp.email)}</div>
  <div>${f("Home Address", emp.homeAddress)}</div></div></div>
  <div class="section"><div class="section-title">Next of Kin</div><div class="two-col">
  <div>${f("Full Name", emp.nextOfKinName)}${f("Contact Number", emp.nextOfKinPhone)}${f("Relationship", emp.nextOfKinRelationship)}</div></div></div>
  <div class="section"><div class="section-title">Employment Details</div><div class="two-col">
  <div>${f("Staff Number", emp.employeeNumber)}${f("Job Title", emp.jobTitle)}${f("Department", emp.department?.name)}${f("Status", emp.status)}${f("Contract Type", emp.contractType)}</div>
  <div>${f("Start Date", fmtDate(emp.startDate))}${f("Contract End", fmtDate(emp.contractEndDate))}${f("Probation End", fmtDate(emp.probationEndDate))}${f("Last Pay Review", fmtDate(emp.lastSalaryReviewDate))}</div>
  </div></div>
  <div class="section"><div class="section-title">Banking Details</div><div class="two-col">
  <div>${f("Bank", emp.bankName)}${f("Account Number", emp.bankAccountNumber)}${f("Branch Code", emp.bankBranchCode)}</div>
  <div>${f("Account Type", emp.bankAccountType)}${f("Verification", emp.bankVerificationStatus)}</div></div></div>
  <div class="section"><div class="section-title">Leave Balances</div>
  <table><thead><tr><th>Leave Type</th><th style="text-align:center">Entitled</th><th style="text-align:center">Used</th><th style="text-align:center">Pending</th><th style="text-align:center">Remaining</th></tr></thead>
  <tbody>${leaveRows}</tbody></table></div>
  <div class="footer"><span>WP Human Connections · ${now}</span><span>Confidential — HR use only.</span></div>
  </div></body></html>`
}

// ─── Main export ──────────────────────────────────────────────────────────────

type Tab = "personal" | "banking" | "training" | "documents" | "notes"

interface Props {
  employee: EmployeeFull
  leaveBalances: LeaveBalance[]
  initialDocuments: EmployeeDocument[]
  initialNotes: HRNote[]
  kpiSummary: KpiSummary
  initialTraining: EmployeeTraining[]
  isHR: boolean
  isOwnProfile: boolean
  canViewDocuments: boolean
  canViewBanking: boolean
  canViewNotes: boolean
  canImpersonate?: boolean
  setImpersonationAction?: (formData: FormData) => Promise<void>
}

export function EmployeeDetailClient({
  employee: emp,
  leaveBalances,
  initialDocuments,
  initialNotes,
  kpiSummary,
  initialTraining,
  isHR,
  isOwnProfile,
  canViewDocuments,
  canViewBanking,
  canViewNotes,
  canImpersonate,
  setImpersonationAction,
}: Props) {
  const [tab, setTab] = useState<Tab>("personal")
  const [nowMs] = useState(() => Date.now())

  const { pct: completeness, missing } = isHR
    ? profileCompleteness(emp)
    : { pct: 0, missing: [] }

  const annualLeave = leaveBalances.find((b) => b.leave_type === "annual")
  const annualRemaining = annualLeave
    ? annualLeave.entitled - annualLeave.used - annualLeave.pending
    : null

  const tabs: { key: Tab; label: string }[] = [
    { key: "personal", label: "Personal & Employment" },
    ...(canViewBanking ? [{ key: "banking" as Tab, label: "Banking & Payroll" }] : []),
    { key: "training", label: "Training & KPIs" },
    ...(canViewDocuments
      ? [
          {
            key: "documents" as Tab,
            label: `Documents${initialDocuments.length > 0 ? ` (${initialDocuments.length})` : ""}`,
          },
        ]
      : []),
    ...(canViewNotes ? [{ key: "notes" as Tab, label: "HR Notes" }] : []),
  ]

  const activeTab = tabs.some((t) => t.key === tab) ? tab : "personal"

  function handlePrint() {
    const html = buildPrintHTML(emp, leaveBalances)
    const win = window.open("", "_blank", "width=900,height=700")
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => {
      win.print()
      win.close()
    }, 300)
  }

  const contractWarning = useMemo(() => {
    if (!emp.contractEndDate) return null
    const daysLeft = Math.round(
      (new Date(emp.contractEndDate).getTime() - nowMs) / 86_400_000
    )
    if (daysLeft <= 0) return { type: "expired" as const, daysLeft }
    if (daysLeft <= 30) return { type: "expiring" as const, daysLeft }
    return null
  }, [emp.contractEndDate, nowMs])

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Back link */}
      <Link
        href="/employees"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft size={16} />
        Back to Employees
      </Link>

      {/* ── Profile header ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-5 items-start">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold shrink-0 shadow-md"
            style={{ background: "var(--brand-primary)" }}
          >
            {emp.avatarInitials}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  {emp.firstName} {emp.lastName}
                </h1>
                <p className="text-muted-foreground mt-0.5">
                  {emp.jobTitle}
                  {emp.department ? ` · ${emp.department.name}` : ""}
                </p>
                {emp.employeeNumber && (
                  <p className="text-xs text-muted-foreground mt-1 font-mono">
                    {emp.employeeNumber}
                  </p>
                )}
              </div>
              <StatusBadge status={emp.status} />
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Mail size={13} />
                {emp.email}
              </span>
              {emp.phone && (
                <span className="flex items-center gap-1.5">
                  <Phone size={13} />
                  {emp.phone}
                </span>
              )}
              {emp.startDate && (
                <span className="flex items-center gap-1.5">
                  <Calendar size={13} />
                  Started {fmtDate(emp.startDate)} · {tenure(emp.startDate)} tenure
                </span>
              )}
              {emp.manager && (
                <span className="flex items-center gap-1.5">
                  <User size={13} />
                  Reports to {emp.manager.firstName} {emp.manager.lastName}
                </span>
              )}
            </div>

            {isHR && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Profile completeness</span>
                  <span
                    className={cn(
                      "font-semibold",
                      completeness === 100
                        ? "text-emerald-600"
                        : completeness > 60
                        ? "text-amber-600"
                        : "text-red-500"
                    )}
                  >
                    {completeness}%
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      completeness === 100
                        ? "bg-emerald-500"
                        : completeness > 60
                        ? "bg-amber-500"
                        : "bg-red-500"
                    )}
                    style={{ width: `${completeness}%` }}
                  />
                </div>
                {missing.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Missing: {missing.slice(0, 3).join(", ")}
                    {missing.length > 3 ? ` +${missing.length - 3} more` : ""}
                  </p>
                )}
              </div>
            )}
          </div>

          {isHR && (
            <div className="flex flex-col sm:flex-row gap-2 shrink-0">
              <Link
                href={`/employees/${emp.id}/edit`}
                className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors"
              >
                <Edit3 size={14} />
                Edit
              </Link>
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors"
              >
                <Printer size={14} />
                Print
              </button>
              {canImpersonate && setImpersonationAction && (
                <form action={setImpersonationAction}>
                  <input type="hidden" name="employeeId" value={emp.id} />
                  <input type="hidden" name="employeeName" value={`${emp.firstName} ${emp.lastName}`} />
                  <button
                    type="submit"
                    className="flex items-center gap-2 px-3 py-2 border border-amber-300 rounded-lg text-sm text-amber-700 hover:bg-amber-50 transition-colors"
                  >
                    <Eye size={14} />
                    View as
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        {contractWarning && (
          <div
            className={cn(
              "mt-4 flex items-center gap-2 p-3 rounded-lg text-sm",
              contractWarning.type === "expired"
                ? "bg-red-50 border border-red-200 text-red-800"
                : "bg-amber-50 border border-amber-200 text-amber-800"
            )}
          >
            <AlertTriangle size={16} />
            {contractWarning.type === "expired"
              ? `Contract expired on ${fmtDate(emp.contractEndDate)}`
              : `Contract expires in ${contractWarning.daysLeft} day${contractWarning.daysLeft !== 1 ? "s" : ""} (${fmtDate(emp.contractEndDate)})`}
          </div>
        )}
      </div>

      {/* ── Stats row ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MiniStat
          label="Tenure"
          value={tenure(emp.startDate)}
          icon={<Clock size={18} />}
          iconClass="text-blue-600 bg-blue-50"
        />
        <MiniStat
          label="Annual Leave"
          value={annualRemaining !== null ? `${annualRemaining.toFixed(0)}d remaining` : "—"}
          icon={<Calendar size={18} />}
          iconClass="text-emerald-600 bg-emerald-50"
        />
        <MiniStat
          label="KPI"
          value={kpiSummary ? kpiSummary.period : "—"}
          icon={<TrendingUp size={18} />}
          iconClass="text-violet-600 bg-violet-50"
        />
        <MiniStat
          label="Documents"
          value={String(initialDocuments.length)}
          icon={<FileText size={18} />}
          iconClass="text-orange-600 bg-orange-50"
        />
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map((t) => (
          <TabButton key={t.key} active={activeTab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </TabButton>
        ))}
      </div>

      {/* ── Tab content ───────────────────────────────────────────────────── */}
      {activeTab === "personal" && (
        <PersonalTab emp={emp} isHR={isHR} isOwnProfile={isOwnProfile} />
      )}
      {activeTab === "banking" && canViewBanking && <BankingTab emp={emp} />}
      {activeTab === "training" && (
        <TrainingKPITab
          kpi={kpiSummary}
          employeeId={emp.id}
          initialTraining={initialTraining}
          canEdit={isHR || isOwnProfile}
        />
      )}
      {activeTab === "documents" && canViewDocuments && (
        <DocumentsTab
          initialDocs={initialDocuments}
          isHR={isHR}
        />
      )}
      {activeTab === "notes" && canViewNotes && (
        <HRNotesTab initialNotes={initialNotes} employeeId={emp.id} />
      )}
    </div>
  )
}

function MiniStat({
  label,
  value,
  icon,
  iconClass,
}: {
  label: string
  value: string
  icon: React.ReactNode
  iconClass: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-start gap-3">
      <div className={cn("rounded-lg p-2 shrink-0", iconClass)}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-bold text-foreground mt-0.5 truncate">{value}</p>
      </div>
    </div>
  )
}
