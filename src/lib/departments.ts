import { createAdminClient } from "@/lib/supabase/admin"

// Settings → Departments. A department's managers are the people in it whose
// access level is "Manager — whole department" (employees.access_level), so
// this and Settings → Who can see what are two views of the same data.
// Service client (access_level isn't readable by sessions): callers MUST check HR first.

export type DeptPerson = { id: string; name: string; jobTitle: string | null; departmentId: string | null }

export type DeptRow = {
  id: string
  name: string
  colour: string
  employeeCount: number
  managers: DeptPerson[]
}

export type DepartmentsData = { departments: DeptRow[]; people: DeptPerson[] }

export async function loadDepartmentsData(): Promise<DepartmentsData> {
  const admin = createAdminClient()
  const [{ data: depts }, { data: emps }] = await Promise.all([
    admin.from("departments").select("id, name, colour").order("name"),
    admin
      .from("employees")
      .select("id, first_name, last_name, job_title, department_id, access_level, is_archived")
      .order("first_name"),
  ])

  const counts = new Map<string, number>()
  const managers = new Map<string, DeptPerson[]>()
  const people: DeptPerson[] = []
  for (const e of emps ?? []) {
    // Count everyone (archived too) — deleting a department moves them all.
    if (e.department_id) counts.set(e.department_id, (counts.get(e.department_id) ?? 0) + 1)
    if (e.is_archived) continue
    const p: DeptPerson = {
      id: e.id,
      name: `${e.first_name} ${e.last_name}`.trim(),
      jobTitle: e.job_title ?? null,
      departmentId: e.department_id ?? null,
    }
    people.push(p)
    if (e.department_id && e.access_level === "manager_department") {
      managers.set(e.department_id, [...(managers.get(e.department_id) ?? []), p])
    }
  }

  return {
    people,
    departments: (depts ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      colour: d.colour,
      employeeCount: counts.get(d.id) ?? 0,
      managers: managers.get(d.id) ?? [],
    })),
  }
}

/**
 * Take department-manager access off these people: back to "direct reports"
 * if anyone reports to them, otherwise Staff.
 */
export async function demoteDepartmentManagers(ids: string[]): Promise<{ error: unknown }> {
  if (ids.length === 0) return { error: null }
  const admin = createAdminClient()
  const { data: reports, error: repErr } = await admin.from("employees").select("manager_id").in("manager_id", ids)
  if (repErr) return { error: repErr }
  const withReports = new Set((reports ?? []).map((r) => r.manager_id as string))
  const now = new Date().toISOString()
  const toReports = ids.filter((id) => withReports.has(id))
  const toStaff = ids.filter((id) => !withReports.has(id))
  for (const [level, group] of [["manager_reports", toReports], ["staff", toStaff]] as const) {
    if (group.length === 0) continue
    const { error } = await admin.from("employees").update({ access_level: level, updated_at: now }).in("id", group)
    if (error) return { error }
  }
  return { error: null }
}
