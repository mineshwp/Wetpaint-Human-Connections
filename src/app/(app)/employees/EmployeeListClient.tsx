"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import {
  Search,
  LayoutGrid,
  List,
  Users,
  UserCheck,
  Briefcase,
  Clock,
  Mail,
  Phone,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { Employee, Department, EmploymentStatus } from "@/lib/types"

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
    label: "On Leave",
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
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl text-base font-bold text-white"
            style={{ backgroundColor: avatarColor(emp.status) }}
          >
            {emp.avatarInitials}
          </div>
          <StatusBadge status={emp.status} />
        </div>

        <p className="text-sm font-bold text-foreground">
          {emp.firstName} {emp.lastName}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{emp.jobTitle}</p>

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
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
            style={{ backgroundColor: avatarColor(emp.status) }}
          >
            {emp.avatarInitials}
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {emp.firstName} {emp.lastName}
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
}

export function EmployeeListClient({ employees, archivedEmployees, departments }: Props) {
  const [search, setSearch] = useState("")
  const [deptFilter, setDeptFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [viewMode, setViewMode] = useState<"grid" | "list">("list")
  const [showArchived, setShowArchived] = useState(false)

  const pool = showArchived ? archivedEmployees : employees

  const filtered = useMemo(() => {
    let list = pool
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (e) =>
          `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) ||
          e.jobTitle.toLowerCase().includes(q) ||
          e.email.toLowerCase().includes(q)
      )
    }
    if (deptFilter !== "all") list = list.filter((e) => e.departmentId === deptFilter)
    if (statusFilter !== "all")
      list = list.filter((e) => e.status === statusFilter)
    return list
  }, [pool, search, deptFilter, statusFilter])

  const activeCount = employees.filter((e) => e.status === "active").length
  const onboardingCount = employees.filter((e) => e.status === "onboarding").length
  const onLeaveCount = employees.filter((e) => e.status === "on-leave").length

  return (
    <>
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-5">
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
        <StatCard
          label="On Leave"
          value={onLeaveCount}
          sub="Away today"
          icon={<Clock className="h-5 w-5" />}
          color="text-amber-600"
          bg="bg-amber-50"
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
            placeholder="Search name, role, email…"
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
          <option value="on-leave">On Leave</option>
          <option value="terminated">Terminated</option>
          <option value="suspended">Suspended</option>
          <option value="resigned">Resigned</option>
        </select>

        {!showArchived && archivedEmployees.length > 0 && (
          <button
            onClick={() => { setShowArchived(true); setStatusFilter("all") }}
            className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            Archived ({archivedEmployees.length})
          </button>
        )}

        <div className="ml-auto flex items-center rounded-lg border border-border overflow-hidden">
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
    </>
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
