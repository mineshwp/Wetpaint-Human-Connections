"use client"

import { useState, useMemo, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Search,
  LayoutGrid,
  List,
  Users,
  UserCheck,
  Briefcase,
  Mail,
  Phone,
  ImagePlus,
  Upload,
  X,
  Loader2,
  Building2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { Employee, Department, EmploymentStatus } from "@/lib/types"
import { DepartmentsManager } from "./DepartmentsManager"

const STATUS_META: Record<
  EmploymentStatus,
  { label: string; fg: string; bg: string }
> = {
  active: {
    label: "Active",
    fg: "text-emerald-700",
    bg: "bg-emerald-50 border-emerald-200",
  },
  onboarding: {
    label: "Onboarding",
    fg: "text-blue-700",
    bg: "bg-blue-50 border-blue-200",
  },
  "on-leave": {
    label: "Inactive",
    fg: "text-amber-700",
    bg: "bg-amber-50 border-amber-200",
  },
  terminated: {
    label: "Terminated",
    fg: "text-gray-500",
    bg: "bg-gray-50 border-gray-200",
  },
  suspended: {
    label: "Suspended",
    fg: "text-red-700",
    bg: "bg-red-50 border-red-200",
  },
  resigned: {
    label: "Resigned",
    fg: "text-purple-700",
    bg: "bg-purple-50 border-purple-200",
  },
}

function StatusBadge({ status }: { status: EmploymentStatus }) {
  const m = STATUS_META[status]
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
        m.fg,
        m.bg
      )}
    >
      {m.label}
    </span>
  )
}

function isContractEmp(e: Employee) {
  return e.contractType === "contract" || e.contractType === "temporary" || !!e.contractEndDate
}

// Days-to-expiry badge: red once past the end date, amber within ~60 days.
function contractExpiry(endDate?: string | null): { tone: "red" | "amber"; label: string } | null {
  if (!endDate) return null
  const end = new Date(endDate + "T00:00:00")
  if (isNaN(end.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.round((end.getTime() - today.getTime()) / 86400000)
  if (days < 0) return { tone: "red", label: "Expired" }
  if (days <= 60) return { tone: "amber", label: days === 0 ? "Ends today" : `${days}d left` }
  return null
}

function ContractBadge({ emp }: { emp: Employee }) {
  if (!isContractEmp(emp)) return null
  const exp = contractExpiry(emp.contractEndDate)
  return (
    <span className="inline-flex items-center gap-1">
      <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold text-violet-700 bg-violet-50 border-violet-200">
        Contract
      </span>
      {exp && (
        <span className={cn(
          "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
          exp.tone === "red" ? "text-red-700 bg-red-50 border-red-200" : "text-amber-700 bg-amber-50 border-amber-200"
        )}>
          {exp.label}
        </span>
      )}
    </span>
  )
}

function fmtDate(d: string | null) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function tenure(startDate: string | null) {
  if (!startDate) return "—"
  const ms = Date.now() - new Date(startDate).getTime()
  const years = Math.floor(ms / (1000 * 60 * 60 * 24 * 365))
  if (years >= 1) return `${years}y`
  const months = Math.floor(ms / (1000 * 60 * 60 * 24 * 30))
  return `${months}m`
}

function avatarColor(status: EmploymentStatus) {
  return status === "on-leave" || status === "terminated" || status === "suspended"
    ? "#9ca3af"
    : "var(--brand-primary)"
}

function EmployeeCard({
  emp,
  departments,
  employees,
}: {
  emp: Employee
  departments: Department[]
  employees: Employee[]
}) {
  const dept = departments.find((d) => d.id === emp.departmentId)
  const manager = employees.find((e) => e.id === emp.managerId)

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      <div className="h-1" style={{ backgroundColor: dept?.colour ?? "#9ca3af" }} />
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          {emp.profilePhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={emp.profilePhotoUrl}
              alt={`${emp.firstName} ${emp.lastName}`}
              className="h-12 w-12 rounded-xl object-cover"
            />
          ) : (
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl text-base font-bold text-white"
              style={{ backgroundColor: avatarColor(emp.status) }}
            >
              {emp.avatarInitials}
            </div>
          )}
          <StatusBadge status={emp.status} />
        </div>

        <p className="text-sm font-bold text-foreground">
          {emp.firstName} {emp.lastName}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{emp.jobTitle}</p>

        {isContractEmp(emp) && (
          <div className="mt-1.5"><ContractBadge emp={emp} /></div>
        )}

        <div className="mt-2 flex items-center gap-1.5">
          <div
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: dept?.colour ?? "#9ca3af" }}
          />
          <span className="text-xs text-muted-foreground">{dept?.name ?? "—"}</span>
        </div>

        <div className="my-3 border-t border-border" />

        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Mail size={11} />
            <span className="truncate">{emp.email}</span>
          </div>
          {emp.phone && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Phone size={11} />
              <span>{emp.phone}</span>
            </div>
          )}
        </div>

        {manager && (
          <p className="mt-3 text-[10px] text-muted-foreground">
            Reports to{" "}
            <span className="font-medium text-foreground">
              {manager.firstName} {manager.lastName}
            </span>
          </p>
        )}

        <p className="mt-0.5 text-[10px] text-muted-foreground">
          Since {fmtDate(emp.startDate)} · {tenure(emp.startDate)} tenure
        </p>

        <div className="mt-3">
          <Link
            href={`/employees/${emp.id}`}
            className="block text-center rounded-lg border border-border py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            View Profile
          </Link>
        </div>
      </div>
    </div>
  )
}

function EmployeeRow({
  emp,
  departments,
  employees,
}: {
  emp: Employee
  departments: Department[]
  employees: Employee[]
}) {
  const dept = departments.find((d) => d.id === emp.departmentId)
  const manager = employees.find((e) => e.id === emp.managerId)

  return (
    <tr className="hover:bg-muted/20 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {emp.profilePhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={emp.profilePhotoUrl}
              alt={`${emp.firstName} ${emp.lastName}`}
              className="h-8 w-8 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: avatarColor(emp.status) }}
            >
              {emp.avatarInitials}
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
              {emp.firstName} {emp.lastName}
              <ContractBadge emp={emp} />
            </p>
            <p className="text-xs text-muted-foreground">{emp.jobTitle}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <div
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: dept?.colour ?? "#9ca3af" }}
          />
          <span className="text-xs text-muted-foreground">{dept?.name ?? "—"}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
        {emp.email}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
        {manager ? `${manager.firstName} ${manager.lastName}` : "—"}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
        {fmtDate(emp.startDate)}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground hidden xl:table-cell">
        {tenure(emp.startDate)}
      </td>
      <td className="px-4 py-3 text-right">
        <StatusBadge status={emp.status} />
      </td>
      <td className="px-4 py-3 text-right">
        <Link
          href={`/employees/${emp.id}`}
          className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors inline-block"
        >
          View
        </Link>
      </td>
    </tr>
  )
}

interface Props {
  employees: Employee[]
  archivedEmployees: Employee[]
  departments: Department[]
  isHR?: boolean
}

export function EmployeeListClient({ employees, archivedEmployees, departments, isHR = false }: Props) {
  const [search, setSearch] = useState("")
  const [deptFilter, setDeptFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [contractFilter, setContractFilter] = useState("all")
  const [viewMode, setViewMode] = useState<"grid" | "list">("list")
  const [showArchived, setShowArchived] = useState(false)
  const [showPhotoUpload, setShowPhotoUpload] = useState(false)
  const [showDepts, setShowDepts] = useState(false)

  const pool = showArchived ? archivedEmployees : employees

  const filtered = useMemo(() => {
    let list = pool
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((e) => {
        const dept = departments.find((d) => d.id === e.departmentId)
        const manager = employees.find((m) => m.id === e.managerId)
        return (
          `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) ||
          e.jobTitle.toLowerCase().includes(q) ||
          e.email.toLowerCase().includes(q) ||
          (e.phone ?? "").toLowerCase().includes(q) ||
          (dept?.name ?? "").toLowerCase().includes(q) ||
          (manager ? `${manager.firstName} ${manager.lastName}` : "").toLowerCase().includes(q)
        )
      })
    }
    if (deptFilter !== "all") list = list.filter((e) => e.departmentId === deptFilter)
    if (statusFilter !== "all")
      list = list.filter((e) => e.status === statusFilter)
    if (contractFilter === "contract") list = list.filter(isContractEmp)
    else if (contractFilter === "expiring")
      list = list.filter((e) => isContractEmp(e) && contractExpiry(e.contractEndDate) !== null)
    return list
  }, [pool, search, deptFilter, statusFilter, contractFilter, departments, employees])

  const activeCount = employees.filter((e) => e.status === "active").length
  const onboardingCount = employees.filter((e) => e.status === "onboarding").length

  return (
    <>
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 mb-5">
        <StatCard
          label="Total"
          value={employees.length}
          sub="All employees"
          icon={<Users className="h-5 w-5" />}
          color="text-blue-600"
          bg="bg-blue-50"
        />
        <StatCard
          label="Active"
          value={activeCount}
          sub="Currently working"
          icon={<UserCheck className="h-5 w-5" />}
          color="text-emerald-600"
          bg="bg-emerald-50"
        />
        <StatCard
          label="Onboarding"
          value={onboardingCount}
          sub="In progress"
          icon={<Briefcase className="h-5 w-5" />}
          color="text-blue-600"
          bg="bg-blue-50"
        />
      </div>

      {/* Archived toggle banner */}
      {showArchived && (
        <div className="mb-3 rounded-lg border border-purple-200 bg-purple-50 px-4 py-2 text-xs text-purple-700 font-medium flex items-center justify-between">
          <span>Showing archived employees</span>
          <button
            onClick={() => { setShowArchived(false); setStatusFilter("all") }}
            className="underline hover:no-underline"
          >
            Back to active
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search name, role, email, phone, department…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
          />
        </div>

        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-ring"
        >
          <option value="all">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-ring"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="onboarding">Onboarding</option>
          <option value="terminated">Terminated</option>
          <option value="suspended">Suspended</option>
          <option value="resigned">Resigned</option>
        </select>

        <select
          value={contractFilter}
          onChange={(e) => setContractFilter(e.target.value)}
          className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-ring"
        >
          <option value="all">All contracts</option>
          <option value="contract">Contract staff</option>
          <option value="expiring">Expiring / expired</option>
        </select>

        {!showArchived && archivedEmployees.length > 0 && (
          <button
            onClick={() => { setShowArchived(true); setStatusFilter("all") }}
            className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            Archived ({archivedEmployees.length})
          </button>
        )}

        {isHR && (
          <button
            onClick={() => setShowDepts(true)}
            className="ml-auto h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground hover:bg-muted transition-colors flex items-center gap-1.5"
          >
            <Building2 size={15} /> Manage departments
          </button>
        )}

        {isHR && (
          <button
            onClick={() => setShowPhotoUpload(true)}
            className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground hover:bg-muted transition-colors flex items-center gap-1.5"
          >
            <ImagePlus size={15} /> Upload photos
          </button>
        )}

        <div className={cn("flex items-center rounded-lg border border-border overflow-hidden", !isHR && "ml-auto")}>
          <button
            onClick={() => setViewMode("list")}
            className={cn(
              "flex h-9 w-9 items-center justify-center transition-colors",
              viewMode === "list"
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:bg-muted"
            )}
            aria-label="List view"
            aria-pressed={viewMode === "list"}
          >
            <List size={15} />
          </button>
          <button
            onClick={() => setViewMode("grid")}
            className={cn(
              "flex h-9 w-9 items-center justify-center transition-colors border-l border-border",
              viewMode === "grid"
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:bg-muted"
            )}
            aria-label="Grid view"
            aria-pressed={viewMode === "grid"}
          >
            <LayoutGrid size={15} />
          </button>
        </div>
      </div>

      <p className="mb-3 text-xs text-muted-foreground">
        {filtered.length} employee{filtered.length !== 1 ? "s" : ""} found
      </p>

      {/* Employee list / grid */}
      {viewMode === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.length === 0 ? (
            <div className="col-span-full rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
              No employees match your search.
            </div>
          ) : (
            filtered.map((e) => (
              <EmployeeCard
                key={e.id}
                emp={e}
                departments={departments}
                employees={employees}
              />
            ))
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    Employee
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    Department
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground hidden md:table-cell">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground hidden lg:table-cell">
                    Manager
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground hidden lg:table-cell">
                    Start Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground hidden xl:table-cell">
                    Tenure
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-10 text-center text-sm text-muted-foreground"
                    >
                      No employees match your search.
                    </td>
                  </tr>
                ) : (
                  filtered.map((e) => (
                    <EmployeeRow
                      key={e.id}
                      emp={e}
                      departments={departments}
                      employees={employees}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showPhotoUpload && (
        <BulkPhotoModal
          employees={[...employees, ...archivedEmployees]}
          onClose={() => setShowPhotoUpload(false)}
        />
      )}

      <DepartmentsManager open={showDepts} onClose={() => setShowDepts(false)} />
    </>
  )
}

// ─── Bulk photo upload ───────────────────────────────────────────────────────
function photoNormalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "")
}

type PhotoMatch = {
  uid: string
  file: File
  previewUrl: string
  employeeId: string // "" = skip
  auto: boolean
}

function BulkPhotoModal({ employees, onClose }: { employees: Employee[]; onClose: () => void }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [matches, setMatches] = useState<PhotoMatch[]>([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result, setResult] = useState<{ ok: number; failed: number } | null>(null)

  // Lookup keys: employee number (primary), then full name, then email local part.
  const keys = useMemo(() => {
    const num = new Map<string, string>(), name = new Map<string, string>(), email = new Map<string, string>()
    for (const e of employees) {
      if (e.employeeNumber) { const k = photoNormalize(e.employeeNumber); if (k) num.set(k, e.id) }
      const nk = photoNormalize(`${e.firstName}${e.lastName}`); if (nk && !name.has(nk)) name.set(nk, e.id)
      const local = e.email?.split("@")[0]
      if (local) { const lk = photoNormalize(local); if (lk && !email.has(lk)) email.set(lk, e.id) }
    }
    return { num, name, email }
  }, [employees])

  function matchFile(file: File): { id: string; auto: boolean } {
    const k = photoNormalize(file.name.replace(/\.[^.]+$/, ""))
    if (keys.num.has(k)) return { id: keys.num.get(k)!, auto: true }
    if (keys.name.has(k)) return { id: keys.name.get(k)!, auto: true }
    if (keys.email.has(k)) return { id: keys.email.get(k)!, auto: true }
    return { id: "", auto: false }
  }

  function onFiles(files: FileList | null) {
    if (!files) return
    const next: PhotoMatch[] = []
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue
      const m = matchFile(file)
      next.push({ uid: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file), employeeId: m.id, auto: m.auto })
    }
    setMatches((prev) => [...prev, ...next])
  }

  function setTarget(uid: string, id: string) {
    setMatches((prev) => prev.map((m) => (m.uid === uid ? { ...m, employeeId: id, auto: false } : m)))
  }
  function removeRow(uid: string) {
    setMatches((prev) => {
      const m = prev.find((x) => x.uid === uid)
      if (m) URL.revokeObjectURL(m.previewUrl)
      return prev.filter((x) => x.uid !== uid)
    })
  }

  const dupIds = useMemo(() => {
    const count = new Map<string, number>()
    for (const m of matches) if (m.employeeId) count.set(m.employeeId, (count.get(m.employeeId) ?? 0) + 1)
    return new Set([...count.entries()].filter(([, c]) => c > 1).map(([id]) => id))
  }, [matches])

  const readyCount = matches.filter((m) => m.employeeId).length

  async function handleUpload() {
    const targets = matches.filter((m) => m.employeeId)
    if (!targets.length) return
    setUploading(true)
    setProgress({ done: 0, total: targets.length })
    let ok = 0, failed = 0
    for (const m of targets) {
      try {
        const fd = new FormData()
        fd.append("file", m.file)
        const res = await fetch(`/api/employees/${m.employeeId}/photo`, { method: "POST", body: fd })
        if (res.ok) ok++
        else failed++
      } catch {
        failed++
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }))
    }
    setUploading(false)
    setResult({ ok, failed })
    router.refresh()
  }

  function close() {
    for (const m of matches) URL.revokeObjectURL(m.previewUrl)
    onClose()
  }

  const empName = (id: string) => {
    const e = employees.find((x) => x.id === id)
    return e ? `${e.firstName} ${e.lastName}` : ""
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={close}>
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-bold text-lg">Upload staff photos</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Add many at once — files are matched to staff automatically. Review, then upload.</p>
          </div>
          <button onClick={close} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {result ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-sm font-semibold">{result.ok} photo{result.ok !== 1 ? "s" : ""} uploaded{result.failed ? ` · ${result.failed} failed` : ""}</p>
              <p className="text-xs text-muted-foreground">Photos now appear on employee cards and profiles.</p>
            </div>
          ) : (
            <>
              <input ref={inputRef} type="file" accept="image/*" multiple className="hidden"
                onChange={(e) => { onFiles(e.target.files); e.target.value = "" }} />
              <div className="rounded-xl border border-dashed border-border p-4 text-center">
                <p className="text-xs text-muted-foreground mb-2">
                  Name each file by the staff member&apos;s <strong>employee number</strong> (e.g. <code>WP061DA.jpg</code>) for the most reliable match. Name or email also work.
                </p>
                <button onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-1.5 h-9 rounded-lg bg-primary text-primary-foreground px-4 text-sm font-semibold hover:bg-primary/90">
                  <ImagePlus size={15} /> Choose images
                </button>
              </div>

              {matches.length > 0 && (
                <div className="space-y-2">
                  {matches.map((m) => (
                    <div key={m.uid} className={cn("flex items-center gap-3 rounded-lg border p-2", m.employeeId ? "border-border" : "border-amber-300 bg-amber-50")}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={m.previewUrl} alt="" className="h-10 w-10 rounded-full object-cover shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">{m.file.name}</p>
                        <select value={m.employeeId} onChange={(e) => setTarget(m.uid, e.target.value)}
                          className={cn("mt-1 w-full rounded border bg-card px-2 py-1 text-xs", m.employeeId ? "border-border" : "border-amber-400")}>
                          <option value="">— Skip (no match) —</option>
                          {employees.map((e) => (
                            <option key={e.id} value={e.id}>{e.firstName} {e.lastName}{e.employeeNumber ? ` · ${e.employeeNumber}` : ""}</option>
                          ))}
                        </select>
                        {m.employeeId && dupIds.has(m.employeeId) && (
                          <p className="text-[10px] text-red-600 mt-0.5">⚠ {empName(m.employeeId)} is assigned to more than one file</p>
                        )}
                        {!m.employeeId && <p className="text-[10px] text-amber-700 mt-0.5">No match — pick a staff member or skip</p>}
                        {m.employeeId && m.auto && <p className="text-[10px] text-emerald-600 mt-0.5">Auto-matched</p>}
                      </div>
                      <button onClick={() => removeRow(m.uid)} className="text-muted-foreground hover:text-foreground shrink-0"><X size={14} /></button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-border">
          <p className="text-xs text-muted-foreground">
            {result ? "" : uploading ? `Uploading ${progress.done}/${progress.total}…` : matches.length ? `${readyCount} of ${matches.length} ready` : "No files selected"}
          </p>
          <div className="flex gap-2">
            <button onClick={close} className="h-9 rounded-lg border border-border bg-card px-4 text-sm hover:bg-muted">{result ? "Done" : "Cancel"}</button>
            {!result && (
              <button onClick={handleUpload} disabled={uploading || readyCount === 0}
                className="h-9 rounded-lg bg-primary text-primary-foreground px-4 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5">
                {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Upload {readyCount || ""}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  icon,
  color,
  bg,
}: {
  label: string
  value: number
  sub: string
  icon: React.ReactNode
  color: string
  bg: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-start gap-3">
      <div className={cn("rounded-lg p-2 shrink-0", bg)}>
        <span className={color}>{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-foreground leading-none">{value}</p>
        <p className="text-xs font-medium text-foreground mt-0.5">{label}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
      </div>
    </div>
  )
}
