import { createAdminClient } from "@/lib/supabase/admin"
import { reportingLine } from "@/lib/reporting-line"

// Who can see what — one row per current employee, for HR's Settings page.
// Mirrors the access rules in lib/auth.ts (getTeamScope) and the database
// helper hc_can_see_employee. Service client: callers MUST check HR first.

export type AccessRow = {
  employeeId: string
  name: string
  department: string | null
  reportsTo: string | null
  login: "none" | "pending" | "active" | "disabled"
  access: string
  sees: string
  seesCount: number | null
  order: number
}

export async function loadAccessOverview(): Promise<AccessRow[]> {
  const admin = createAdminClient()
  const [{ data: emps }, { data: logins }, { data: authList }] = await Promise.all([
    admin
      .from("employees")
      .select("id, first_name, last_name, department_id, manager_id, status, department:departments!employees_department_id_fkey(name)")
      .eq("is_archived", false),
    admin.from("app_users").select("id, employee_id, active_role, manager_scope, accepted_at"),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ])

  const staff = emps ?? []
  const nameOf = new Map(staff.map((e) => [e.id, `${e.first_name} ${e.last_name}`.trim()]))
  const deptName = new Map<string, string>()
  for (const e of staff) {
    const d = e.department as unknown as { name: string } | null
    if (e.department_id && d) deptName.set(e.department_id, d.name)
  }
  const bannedIds = new Set(
    (authList?.users ?? [])
      .filter((u) => u.banned_until && new Date(u.banned_until).getTime() > Date.now())
      .map((u) => u.id)
  )
  const loginByEmp = new Map((logins ?? []).filter((l) => l.employee_id).map((l) => [l.employee_id as string, l]))
  const inDepts = (ids: string[], selfId: string) =>
    staff.filter((e) => e.department_id && ids.includes(e.department_id) && e.id !== selfId)

  const rows = staff.map((e): AccessRow => {
    const l = loginByEmp.get(e.id)
    const login: AccessRow["login"] = !l ? "none" : bannedIds.has(l.id) ? "disabled" : l.accepted_at ? "active" : "pending"
    const base = {
      employeeId: e.id,
      name: nameOf.get(e.id) ?? "",
      department: e.department_id ? deptName.get(e.department_id) ?? null : null,
      reportsTo: e.manager_id ? nameOf.get(e.manager_id) ?? null : null,
      login,
    }

    if (!l) return { ...base, access: "—", sees: "No login yet", seesCount: null, order: 5 }
    if (login === "disabled") return { ...base, access: "Disabled", sees: "Nothing — login disabled", seesCount: 0, order: 6 }
    if (l.active_role === "hr") return { ...base, access: "HR / Admin", sees: "Everyone", seesCount: staff.length, order: 0 }

    if (l.active_role === "manager" && l.manager_scope === "line") {
      const ids = reportingLine(staff, e.id)
      return {
        ...base,
        access: "Manager · whole reporting line",
        sees: ids.length ? ids.map((id) => nameOf.get(id)).join(", ") : "Nobody yet — set their team's \"Reports to\"",
        seesCount: ids.length,
        order: 1,
      }
    }
    if (l.active_role === "manager" && l.manager_scope === "reports") {
      const team = staff.filter((x) => x.manager_id === e.id)
      return {
        ...base,
        access: "Manager · direct reports",
        sees: team.length ? team.map((x) => nameOf.get(x.id)).join(", ") : "Nobody yet — set their team's \"Reports to\"",
        seesCount: team.length,
        order: 2,
      }
    }
    if (l.active_role === "manager") {
      const team = e.department_id ? inDepts([e.department_id], e.id) : []
      return {
        ...base,
        access: "Manager · whole department",
        sees: e.department_id ? `All of ${deptName.get(e.department_id) ?? "their department"}` : "Nobody — no department set",
        seesCount: team.length,
        order: 3,
      }
    }
    return { ...base, access: "Staff", sees: "Own profile only", seesCount: 0, order: 4 }
  })

  return rows.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
}
