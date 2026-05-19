"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, Loader2, Save } from "lucide-react"
import Link from "next/link"
import { PageHeader } from "@/components/layout/PageHeader"
import type { Department, Employee, EmployeeFull } from "@/lib/types"

// ── Field primitives ──────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
      {children}
    </label>
  )
}

function Input({
  value,
  onChange,
  type = "text",
  placeholder,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
    />
  )
}

function SelectField({
  value,
  onChange,
  children,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {children}
    </select>
  )
}

function FormGroup({ label, children, span2 }: { label: string; children: React.ReactNode; span2?: boolean }) {
  return (
    <div className={span2 ? "sm:col-span-2" : undefined}>
      <Label>{label}</Label>
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
  employee: EmployeeFull
  departments: Department[]
  allEmployees: Employee[]
}

export function EditEmployeeClient({ employee, departments, allEmployees }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    firstName: employee.firstName ?? "",
    lastName: employee.lastName ?? "",
    dateOfBirth: employee.dateOfBirth ?? "",
    identityNumber: employee.identityNumber ?? "",
    gender: employee.gender ?? "",
    race: employee.race ?? "",
    disability: employee.disability ?? "",
    citizenshipStatus: employee.citizenshipStatus ?? "",
    vatNumber: employee.vatNumber ?? "",
    phone: employee.phone ?? "",
    alternatePhone: employee.alternatePhone ?? "",
    personalEmail: employee.personalEmail ?? "",
    workEmail: employee.workEmail ?? "",
    homeAddress: employee.homeAddress ?? "",
    nextOfKinName: employee.nextOfKinName ?? "",
    nextOfKinPhone: employee.nextOfKinPhone ?? "",
    nextOfKinRelationship: employee.nextOfKinRelationship ?? "",
    employeeNumber: employee.employeeNumber ?? "",
    jobTitle: employee.jobTitle ?? "",
    departmentId: employee.departmentId ?? "",
    managerId: employee.managerId ?? "",
    salaryBand: employee.salaryBand ?? "",
    status: employee.status ?? "active",
    contractType: employee.contractType ?? "",
    startDate: employee.startDate ?? "",
    contractEndDate: employee.contractEndDate ?? "",
    probationEndDate: employee.probationEndDate ?? "",
    lastSalaryReviewDate: employee.lastSalaryReviewDate ?? "",
    resignationDate: employee.resignationDate ?? "",
    isArchived: employee.isArchived ?? false,
    bankName: employee.bankName ?? "",
    bankAccountNumber: employee.bankAccountNumber ?? "",
    bankBranchCode: employee.bankBranchCode ?? "",
    bankAccountType: employee.bankAccountType ?? "",
    bankVerificationStatus: employee.bankVerificationStatus ?? "",
  })

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/employees/${employee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: form.firstName,
          last_name: form.lastName,
          date_of_birth: form.dateOfBirth,
          identity_number: form.identityNumber,
          gender: form.gender,
          race: form.race,
          disability: form.disability,
          citizenship_status: form.citizenshipStatus,
          vat_number: form.vatNumber,
          phone: form.phone,
          alternate_phone: form.alternatePhone,
          personal_email: form.personalEmail,
          work_email: form.workEmail,
          home_address: form.homeAddress,
          next_of_kin_name: form.nextOfKinName,
          next_of_kin_phone: form.nextOfKinPhone,
          next_of_kin_relationship: form.nextOfKinRelationship,
          employee_number: form.employeeNumber,
          job_title: form.jobTitle,
          department_id: form.departmentId,
          manager_id: form.managerId,
          salary_band: form.salaryBand,
          status: form.status,
          contract_type: form.contractType,
          start_date: form.startDate,
          contract_end_date: form.contractEndDate,
          probation_end_date: form.probationEndDate,
          last_salary_review_date: form.lastSalaryReviewDate,
          resignation_date: form.resignationDate,
          is_archived: form.isArchived,
          bank_name: form.bankName,
          bank_account_number: form.bankAccountNumber,
          bank_branch_code: form.bankBranchCode,
          bank_account_type: form.bankAccountType,
          bank_verification_status: form.bankVerificationStatus,
        }),
      })

      if (!res.ok) {
        const json = await res.json()
        setError(json.error ?? "Save failed")
        return
      }

      router.push(`/employees/${employee.id}`)
    } catch {
      setError("Save failed — please try again")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title={`Edit — ${employee.firstName} ${employee.lastName}`}
        subtitle={employee.employeeNumber ? `Staff No. ${employee.employeeNumber}` : undefined}
      >
        <div className="flex items-center gap-2">
          <Link
            href={`/employees/${employee.id}`}
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
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save Changes
          </button>
        </div>
      </PageHeader>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {/* Personal Information */}
        <SectionCard title="Personal Information" subtitle="Identity & EE data">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormGroup label="First Name">
              <Input value={form.firstName} onChange={set("firstName")} placeholder="First name" />
            </FormGroup>
            <FormGroup label="Surname">
              <Input value={form.lastName} onChange={set("lastName")} placeholder="Surname" />
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
            <FormGroup label="VAT Number">
              <Input value={form.vatNumber} onChange={set("vatNumber")} placeholder="VAT / tax reference" />
            </FormGroup>
          </div>
        </SectionCard>

        {/* Contact Details */}
        <SectionCard title="Contact Details" subtitle="Phone, email & address">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormGroup label="Cell Phone">
              <Input value={form.phone} onChange={set("phone")} placeholder="+27 xx xxx xxxx" />
            </FormGroup>
            <FormGroup label="Alternate Number">
              <Input value={form.alternatePhone} onChange={set("alternatePhone")} placeholder="Alternate number" />
            </FormGroup>
            <FormGroup label="Personal Email">
              <Input value={form.personalEmail} onChange={set("personalEmail")} type="email" placeholder="personal@email.com" />
            </FormGroup>
            <FormGroup label="Work Email">
              <Input value={form.workEmail} onChange={set("workEmail")} type="email" placeholder="name@wetpaint.co.za" />
            </FormGroup>
            <FormGroup label="Home Address" span2>
              <Input value={form.homeAddress} onChange={set("homeAddress")} placeholder="Full home address" />
            </FormGroup>
          </div>
        </SectionCard>

        {/* Next of Kin */}
        <SectionCard title="Next of Kin" subtitle="Emergency contact">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormGroup label="Name">
              <Input value={form.nextOfKinName} onChange={set("nextOfKinName")} placeholder="Full name" />
            </FormGroup>
            <FormGroup label="Contact Number">
              <Input value={form.nextOfKinPhone} onChange={set("nextOfKinPhone")} placeholder="Phone number" />
            </FormGroup>
            <FormGroup label="Relationship">
              <Input value={form.nextOfKinRelationship} onChange={set("nextOfKinRelationship")} placeholder="e.g. Spouse, Parent" />
            </FormGroup>
          </div>
        </SectionCard>

        {/* Employment Details */}
        <SectionCard title="Employment Details" subtitle="Role, contract & reporting">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormGroup label="Staff Number">
              <Input value={form.employeeNumber} onChange={set("employeeNumber")} placeholder="e.g. WP001AB" />
            </FormGroup>
            <FormGroup label="Job Title">
              <Input value={form.jobTitle} onChange={set("jobTitle")} placeholder="Job title" />
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
                {allEmployees
                  .filter((e) => e.id !== employee.id)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.firstName} {e.lastName} — {e.jobTitle}
                    </option>
                  ))}
              </SelectField>
            </FormGroup>
            <FormGroup label="Salary Band">
              <Input value={form.salaryBand} onChange={set("salaryBand")} placeholder="e.g. Band C" />
            </FormGroup>
            <FormGroup label="Status">
              <SelectField value={form.status} onChange={set("status")}>
                <option value="active">Active</option>
                <option value="onboarding">Onboarding</option>
                <option value="on-leave">On Leave</option>
                <option value="suspended">Suspended</option>
                <option value="terminated">Terminated</option>
                <option value="resigned">Resigned</option>
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
            <FormGroup label="Start Date">
              <Input value={form.startDate} onChange={set("startDate")} type="date" />
            </FormGroup>
            <FormGroup label="Contract End Date">
              <Input value={form.contractEndDate} onChange={set("contractEndDate")} type="date" />
            </FormGroup>
            <FormGroup label="Probation End Date">
              <Input value={form.probationEndDate} onChange={set("probationEndDate")} type="date" />
            </FormGroup>
            <FormGroup label="Last Salary Review">
              <Input value={form.lastSalaryReviewDate} onChange={set("lastSalaryReviewDate")} type="date" />
            </FormGroup>
            {form.status === "resigned" && (
              <FormGroup label="Resignation Date">
                <Input value={form.resignationDate} onChange={set("resignationDate")} type="date" />
              </FormGroup>
            )}
          </div>
        </SectionCard>

        {/* Archive */}
        <SectionCard title="Archive" subtitle="Archived employees are hidden from the main list but remain accessible">
          <div className="flex items-start gap-3">
            <input
              id="is-archived"
              type="checkbox"
              checked={form.isArchived}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, isArchived: e.target.checked }))
              }
              className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
            />
            <label htmlFor="is-archived" className="text-sm text-foreground cursor-pointer">
              Archive this employee
              <span className="block text-xs text-muted-foreground mt-0.5">
                They will no longer appear in the main employee list. Use the &ldquo;Archived&rdquo; toggle on the list page to access them.
              </span>
            </label>
          </div>
        </SectionCard>

        {/* Banking Details */}
        <SectionCard title="Banking Details" subtitle="Payroll bank account information">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormGroup label="Bank Name">
              <Input value={form.bankName} onChange={set("bankName")} placeholder="e.g. Standard Bank" />
            </FormGroup>
            <FormGroup label="Account Number">
              <Input value={form.bankAccountNumber} onChange={set("bankAccountNumber")} placeholder="Bank account number" />
            </FormGroup>
            <FormGroup label="Branch Code">
              <Input value={form.bankBranchCode} onChange={set("bankBranchCode")} placeholder="6-digit branch code" />
            </FormGroup>
            <FormGroup label="Account Type">
              <SelectField value={form.bankAccountType} onChange={set("bankAccountType")}>
                <option value="">— Select —</option>
                <option value="cheque">Cheque</option>
                <option value="savings">Savings</option>
                <option value="transmission">Transmission</option>
              </SelectField>
            </FormGroup>
            <FormGroup label="Verification Status">
              <SelectField value={form.bankVerificationStatus} onChange={set("bankVerificationStatus")}>
                <option value="">— Select —</option>
                <option value="verified">Verified</option>
                <option value="unverified">Unverified</option>
                <option value="pending">Pending</option>
              </SelectField>
            </FormGroup>
          </div>
        </SectionCard>

        {/* Bottom save bar */}
        <div className="flex justify-end gap-3 pb-8">
          <Link
            href={`/employees/${employee.id}`}
            className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors"
          >
            Cancel
          </Link>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}
