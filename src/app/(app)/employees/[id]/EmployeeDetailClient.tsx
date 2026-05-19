"use client"

import { useState } from "react"
import Link from "next/link"
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
} from "lucide-react"
import { cn } from "@/lib/utils"
import type {
  EmployeeFull,
  LeaveBalance,
  EmployeeDocument,
  HRNote,
  KpiSummary,
  EmploymentStatus,
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
    <span
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-semibold",
        m.fg,
        m.bg
      )}
    >
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
}: {
  title?: string
  subtitle?: string
  children: React.ReactNode
  padded?: boolean
}) {
  return (
    <div className="rounded-xl border border-border bg-card">
      {(title || subtitle) && (
        <div className="px-5 py-4 border-b border-border">
          {title && <p className="text-sm font-semibold text-foreground">{title}</p>}
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
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

// ─── Tab 1: Personal & Employment ────────────────────────────────────────────

function PersonalTab({
  emp,
  isHR,
}: {
  emp: EmployeeFull
  isHR: boolean
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <SectionCard title="Personal Information" subtitle="Identity & EE data">
        <FieldRow label="First Name" value={emp.firstName} />
        <FieldRow label="Surname" value={emp.lastName} />
        <FieldRow label="Gender" value={emp.gender} />
        {isHR && <FieldRow label="Date of Birth" value={fmtDate(emp.dateOfBirth)} />}
        {isHR && <FieldRow label="Identity Number" value={emp.identityNumber} sensitive />}
        {isHR && <FieldRow label="Race (EE)" value={emp.race} />}
        {isHR && <FieldRow label="Disability" value={emp.disability} />}
        {isHR && <FieldRow label="Citizenship" value={emp.citizenshipStatus} />}
        {isHR && <FieldRow label="VAT / Tax Ref" value={emp.vatNumber} />}
      </SectionCard>

      <SectionCard title="Contact Details" subtitle="Phone, email & address">
        <FieldRow label="Cell Phone" value={emp.phone} />
        <FieldRow label="Alternate Number" value={emp.alternatePhone} />
        <FieldRow label="Personal Email" value={emp.personalEmail} />
        <FieldRow label="Work Email" value={emp.workEmail ?? emp.email} />
        {isHR && <FieldRow label="Home Address" value={emp.homeAddress} />}
      </SectionCard>

      <SectionCard title="Next of Kin" subtitle="Emergency contact">
        <FieldRow label="Name" value={emp.nextOfKinName} />
        <FieldRow label="Contact Number" value={emp.nextOfKinPhone} />
        <FieldRow label="Relationship" value={emp.nextOfKinRelationship} />
      </SectionCard>

      <SectionCard title="Employment Details" subtitle="Role, contract & reporting">
        <FieldRow label="Staff Number" value={emp.employeeNumber} />
        <FieldRow label="Job Title" value={emp.jobTitle} />
        <FieldRow label="Department" value={emp.department?.name} />
        <FieldRow
          label="Contract Type"
          value={
            emp.contractType
              ? emp.contractType.charAt(0).toUpperCase() + emp.contractType.slice(1)
              : null
          }
        />
        <FieldRow label="Start Date" value={fmtDate(emp.startDate)} />
        {emp.contractEndDate && (
          <FieldRow label="Contract End" value={fmtDate(emp.contractEndDate)} />
        )}
        {emp.probationEndDate && (
          <FieldRow label="Probation End" value={fmtDate(emp.probationEndDate)} />
        )}
        {isHR && emp.lastSalaryReviewDate && (
          <FieldRow label="Last Pay Review" value={fmtDate(emp.lastSalaryReviewDate)} />
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

// ─── Tab 3: Leave ─────────────────────────────────────────────────────────────

const LEAVE_LABELS: Record<string, string> = {
  annual: "Annual Leave",
  sick: "Sick Leave",
  family: "Family Responsibility",
  study: "Study Leave",
  unpaid: "Unpaid Leave",
  recess: "Recess Leave",
  other: "Other",
}

function LeaveTab({ balances }: { balances: LeaveBalance[] }) {
  if (balances.length === 0) {
    return (
      <SectionCard>
        <div className="text-center py-12">
          <Calendar size={40} className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No leave balances found for this employee.
          </p>
        </div>
      </SectionCard>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {balances.map((b) => {
        const remaining = b.entitled - b.used - b.pending
        const pct =
          b.entitled > 0
            ? Math.round(((b.entitled - b.used) / b.entitled) * 100)
            : 0
        return (
          <SectionCard key={b.leave_type} title={LEAVE_LABELS[b.leave_type] ?? b.leave_type}>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Remaining</span>
              <span className="font-semibold">{remaining.toFixed(1)} days</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 mb-3">
              <div
                className="h-2 rounded-full bg-emerald-500"
                style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
              />
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Entitled</span>
                <span>{b.entitled} days</span>
              </div>
              <div className="flex justify-between">
                <span>Used</span>
                <span>{b.used} days</span>
              </div>
              {b.pending > 0 && (
                <div className="flex justify-between">
                  <span>Pending</span>
                  <span>{b.pending} days</span>
                </div>
              )}
            </div>
          </SectionCard>
        )
      })}
    </div>
  )
}

// ─── Tab 4: Training & KPIs ───────────────────────────────────────────────────

function TrainingKPITab({
  kpi,
  employeeId,
}: {
  kpi: KpiSummary
  employeeId: string
}) {
  const STATUS_COLOR: Record<string, string> = {
    draft: "text-gray-500 bg-gray-50 border-gray-200",
    active: "text-blue-700 bg-blue-50 border-blue-200",
    completed: "text-emerald-700 bg-emerald-50 border-emerald-200",
  }

  return (
    <div className="space-y-6">
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
          <Link
            href={`/kpi/${kpi.reviewId}`}
            className="text-sm font-medium hover:underline"
            style={{ color: "var(--brand-primary)" }}
          >
            View full KPI review →
          </Link>
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

      <SectionCard title="Training" subtitle="Courses and certifications">
        <div className="text-center py-8">
          <BookOpen size={36} className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Training module coming soon.</p>
        </div>
      </SectionCard>
    </div>
  )
}

// ─── Tab 5: Documents ─────────────────────────────────────────────────────────

function DocumentsTab({
  initialDocs,
  isHR,
  employeeId,
}: {
  initialDocs: EmployeeDocument[]
  isHR: boolean
  employeeId: string
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
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">
                    Document
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">
                    Category
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">
                    Uploaded
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">
                    Size
                  </th>
                  {isHR && (
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">
                      Staff Visibility
                    </th>
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
                          onClick={() =>
                            toggleVisibility(doc.id, doc.hidden_from_employee)
                          }
                          disabled={togglingId === doc.id}
                          className={cn(
                            "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border transition-colors disabled:opacity-50",
                            doc.hidden_from_employee
                              ? "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
                              : "bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100"
                          )}
                        >
                          {doc.hidden_from_employee ? (
                            <EyeOff size={12} />
                          ) : (
                            <Eye size={12} />
                          )}
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

// ─── Tab 6: HR Notes ──────────────────────────────────────────────────────────

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
      <span class="fl">${label}</span>
      <span class="${val ? "fv" : "fe"}">${val ?? "Not provided"}</span>
    </div>`

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
  <title>Employee Record — ${emp.firstName} ${emp.lastName}</title>
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
  <div class="banner"><div class="avatar">${emp.avatarInitials}</div><div>
  <div class="emp-name">${emp.firstName} ${emp.lastName}</div>
  <div class="emp-title">${emp.jobTitle}${emp.department ? ` · ${emp.department.name}` : ""}</div>
  <div class="status" style="${statusColors[emp.status] ?? ""}">${emp.status.replace("-", " ")}</div>
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

type Tab = "personal" | "banking" | "leave" | "training" | "documents" | "notes"

interface Props {
  employee: EmployeeFull
  leaveBalances: LeaveBalance[]
  initialDocuments: EmployeeDocument[]
  initialNotes: HRNote[]
  kpiSummary: KpiSummary
  isHR: boolean
  canViewDocuments: boolean
  canViewBanking: boolean
  canViewNotes: boolean
}

export function EmployeeDetailClient({
  employee: emp,
  leaveBalances,
  initialDocuments,
  initialNotes,
  kpiSummary,
  isHR,
  canViewDocuments,
  canViewBanking,
  canViewNotes,
}: Props) {
  const [tab, setTab] = useState<Tab>("personal")

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
    { key: "leave", label: "Leave" },
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

  // Ensure active tab is always valid
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

  // Contract expiry check
  const contractWarning = (() => {
    if (!emp.contractEndDate) return null
    const daysLeft = Math.round(
      (new Date(emp.contractEndDate).getTime() - Date.now()) / 86_400_000
    )
    if (daysLeft <= 0) {
      return { type: "expired" as const, daysLeft }
    }
    if (daysLeft <= 30) {
      return { type: "expiring" as const, daysLeft }
    }
    return null
  })()

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
          {/* Avatar */}
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold shrink-0 shadow-md"
            style={{ background: "var(--brand-primary)" }}
          >
            {emp.avatarInitials}
          </div>

          {/* Core info */}
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

            {/* Quick info row */}
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

            {/* Profile completeness — HR only */}
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
                    Missing:{" "}
                    {missing.slice(0, 3).join(", ")}
                    {missing.length > 3 ? ` +${missing.length - 3} more` : ""}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Action buttons — HR only */}
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
            </div>
          )}
        </div>

        {/* Contract warning */}
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
      {activeTab === "personal" && <PersonalTab emp={emp} isHR={isHR} />}
      {activeTab === "banking" && canViewBanking && <BankingTab emp={emp} />}
      {activeTab === "leave" && <LeaveTab balances={leaveBalances} />}
      {activeTab === "training" && (
        <TrainingKPITab kpi={kpiSummary} employeeId={emp.id} />
      )}
      {activeTab === "documents" && canViewDocuments && (
        <DocumentsTab
          initialDocs={initialDocuments}
          isHR={isHR}
          employeeId={emp.id}
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
