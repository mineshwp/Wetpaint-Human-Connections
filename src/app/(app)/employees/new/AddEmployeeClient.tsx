"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, Loader2, UserPlus } from "lucide-react"
import Link from "next/link"
import { PageHeader } from "@/components/layout/PageHeader"
import type { Department, Employee } from "@/lib/types"

// ── Field primitives (shared style) ──────────────────────────────────────────

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
      {children}{required && <span className="text-destructive ml-0.5">*</span>}
    </label>
  )
}

function Input({
  value,
  onChange,
  type = "text",
  placeholder,
  required,
}: {
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  required?: boolean
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
    />
  )
}

function SelectField({
  value,
  onChange,
  children,
}: {
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
    >
      {children}
    </select>
  )
}

function FormGroup({ label, children, span2, required }: { label: string; children: React.ReactNode; span2?: boolean; required?: boolean }) {
  return (
    <div className={span2 ? "sm:col-span-2" : undefined}>
      <Label required={required}>{label}</Label>
      {children}
    </div>
  )
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-5 py-4 border-b border-border">
        <p className="font-semibold text-foreground">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  departments: Department[]
  allEmployees: Employee[]
}

export function AddEmployeeClient({ departments, allEmployees }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    jobTitle: "",
    status: "onboarding",
    contractType: "",
    contractTermMonths: "",
    contractIsRenewable: false,
    departmentId: "",
    managerId: "",
    employeeNumber: "",
    startDate: "",
    contractEndDate: "",
    probationEndDate: "",
    phone: "",
    workEmail: "",
    salaryBand: "",
    dateOfBirth: "",
    identityNumber: "",
    gender: "",
    race: "",
    disability: "",
    citizenshipStatus: "",
  })

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  async function handleSave() {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim() || !form.jobTitle.trim()) {
      setError("First name, surname, email and job title are required.")
      return
    }

    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: form.firstName,
          last_name: form.lastName,
          email: form.email,
          job_title: form.jobTitle,
          status: form.status,
          contract_type: form.contractType,
          contract_term_months: form.contractTermMonths === "" ? null : Number(form.contractTermMonths),
          contract_is_renewable: form.contractIsRenewable,
          department_id: form.departmentId,
          manager_id: form.managerId,
          employee_number: form.employeeNumber,
          start_date: form.startDate,
          contract_end_date: form.contractEndDate,
          probation_end_date: form.probationEndDate,
          phone: form.phone,
          work_email: form.workEmail,
          salary_band: form.salaryBand,
          date_of_birth: form.dateOfBirth,
          identity_number: form.identityNumber,
          gender: form.gender,
          race: form.race,
          disability: form.disability,
          citizenship_status: form.citizenshipStatus,
        }),
      })

      if (!res.ok) {
        const json = await res.json()
        setError(json.error ?? "Failed to create employee")
        return
      }

      const { id } = await res.json()
      router.push(`/employees/${id}`)
    } catch {
      setError("Something went wrong — please try again")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader title="Add Employee" subtitle="Create a new employee record">
        <div className="flex items-center gap-2">
          <Link
            href="/employees"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors"
          >
            <ChevronLeft size={14} />
            Back
          </Link>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
            Create Employee
          </button>
        </div>
      </PageHeader>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {/* Core Details */}
        <SectionCard title="Core Details" subtitle="Required to create the record">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormGroup label="First Name" required>
              <Input value={form.firstName} onChange={set("firstName")} placeholder="First name" />
            </FormGroup>
            <FormGroup label="Surname" required>
              <Input value={form.lastName} onChange={set("lastName")} placeholder="Surname" />
            </FormGroup>
            <FormGroup label="Work Email" required>
              <Input value={form.email} onChange={set("email")} type="email" placeholder="name@wetpaint.co.za" />
            </FormGroup>
            <FormGroup label="Job Title" required>
              <Input value={form.jobTitle} onChange={set("jobTitle")} placeholder="Job title" />
            </FormGroup>
          </div>
        </SectionCard>

        {/* Employment Details */}
        <SectionCard title="Employment Details" subtitle="Contract, department & reporting line">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormGroup label="Staff Number">
              <Input value={form.employeeNumber} onChange={set("employeeNumber")} placeholder="e.g. WP001AB" />
            </FormGroup>
            <FormGroup label="Status">
              <SelectField value={form.status} onChange={set("status")}>
                <option value="onboarding">Onboarding</option>
                <option value="active">Active</option>
              </SelectField>
            </FormGroup>
            <FormGroup label="Contract Type">
              <SelectField value={form.contractType} onChange={set("contractType")}>
                <option value="">— Select —</option>
                <option value="permanent">Permanent</option>
                <option value="temporary">Temporary</option>
                <option value="contract">Contract</option>
              </SelectField>
            </FormGroup>
            <FormGroup label="Department">
              <SelectField value={form.departmentId} onChange={set("departmentId")}>
                <option value="">— Select department —</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </SelectField>
            </FormGroup>
            <FormGroup label="Manager">
              <SelectField value={form.managerId} onChange={set("managerId")}>
                <option value="">— No manager —</option>
                {allEmployees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.firstName} {e.lastName} — {e.jobTitle}
                  </option>
                ))}
              </SelectField>
            </FormGroup>
            <FormGroup label="Salary Band">
              <Input value={form.salaryBand} onChange={set("salaryBand")} placeholder="e.g. Band C" />
            </FormGroup>
            <FormGroup label="Start Date">
              <Input value={form.startDate} onChange={set("startDate")} type="date" />
            </FormGroup>
            <FormGroup label="Contract End Date">
              <Input value={form.contractEndDate} onChange={set("contractEndDate")} type="date" />
            </FormGroup>
            <FormGroup label="Contract Term (months)">
              <Input value={form.contractTermMonths} onChange={set("contractTermMonths")} type="number" placeholder="e.g. 12" />
            </FormGroup>
            <FormGroup label="Renewable Contract">
              <label className="inline-flex items-center gap-2 text-sm h-10">
                <input
                  type="checkbox"
                  checked={form.contractIsRenewable}
                  onChange={(e) => setForm((prev) => ({ ...prev, contractIsRenewable: e.target.checked }))}
                  className="h-4 w-4 rounded border-border"
                />
                <span className="text-muted-foreground">This contract can be renewed</span>
              </label>
            </FormGroup>
            <FormGroup label="Probation End Date">
              <Input value={form.probationEndDate} onChange={set("probationEndDate")} type="date" />
            </FormGroup>
          </div>
        </SectionCard>

        {/* Personal Information */}
        <SectionCard title="Personal Information" subtitle="Identity & EE data — can be completed later">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormGroup label="Cell Phone">
              <Input value={form.phone} onChange={set("phone")} placeholder="+27 xx xxx xxxx" />
            </FormGroup>
            <FormGroup label="Date of Birth">
              <Input value={form.dateOfBirth} onChange={set("dateOfBirth")} type="date" />
            </FormGroup>
            <FormGroup label="Identity Number">
              <Input value={form.identityNumber} onChange={set("identityNumber")} placeholder="SA ID number" />
            </FormGroup>
            <FormGroup label="Gender">
              <SelectField value={form.gender} onChange={set("gender")}>
                <option value="">— Select —</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Non-binary">Non-binary</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </SelectField>
            </FormGroup>
            <FormGroup label="Race (EE)">
              <SelectField value={form.race} onChange={set("race")}>
                <option value="">— Select —</option>
                <option value="African">African</option>
                <option value="Coloured">Coloured</option>
                <option value="Indian">Indian</option>
                <option value="White">White</option>
                <option value="Other">Other</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </SelectField>
            </FormGroup>
            <FormGroup label="Disability">
              <SelectField value={form.disability} onChange={set("disability")}>
                <option value="">— Select —</option>
                <option value="None">None</option>
                <option value="Yes">Yes</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </SelectField>
            </FormGroup>
            <FormGroup label="Citizenship Status">
              <SelectField value={form.citizenshipStatus} onChange={set("citizenshipStatus")}>
                <option value="">— Select —</option>
                <option value="SA Citizen">SA Citizen</option>
                <option value="Permanent Resident">Permanent Resident</option>
                <option value="Work Permit">Work Permit</option>
                <option value="Other">Other</option>
              </SelectField>
            </FormGroup>
          </div>
        </SectionCard>

        {/* Bottom save bar */}
        <div className="flex justify-end gap-3 pb-8">
          <Link
            href="/employees"
            className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors"
          >
            Cancel
          </Link>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
            Create Employee
          </button>
        </div>
      </div>
    </div>
  )
}
