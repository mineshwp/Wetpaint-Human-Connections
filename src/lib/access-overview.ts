import { createAdminClient } from "@/lib/supabase/admin"
import type { AccessLevel } from "@/lib/access-levels"
import type { AccessData, AccessPerson } from "@/lib/access-visibility"

export type { AccessData, AccessPerson } from "@/lib/access-visibility"

// Data for Settings → Who can see what: every current employee with their
// department, "Reports to", access level and login status. Service client:
// callers MUST check HR first.

export async function loadAccessData(): Promise<AccessData> {
  const admin = createAdminClient()
  const [{ data: emps }, { data: logins }, { data: depts }, { data: authList }] = await Promise.all([
    admin
      .from("employees")
      .select("id, first_name, last_name, job_title, department_id, manager_id, access_level")
      .eq("is_archived", false)
      .order("first_name"),
    admin.from("app_users").select("id, employee_id, active_role, accepted_at"),
    admin.from("departments").select("id, name").order("name"),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ])

  const banned = new Set(
    (authList?.users ?? [])
      .filter((u) => u.banned_until && new Date(u.banned_until).getTime() > Date.now())
      .map((u) => u.id)
  )
  const loginByEmp = new Map((logins ?? []).filter((l) => l.employee_id).map((l) => [l.employee_id as string, l]))

  return {
    departments: depts ?? [],
    people: (emps ?? []).map((e): AccessPerson => {
      const l = loginByEmp.get(e.id)
      return {
        id: e.id,
        name: `${e.first_name} ${e.last_name}`.trim(),
        jobTitle: e.job_title ?? null,
        departmentId: e.department_id ?? null,
        managerId: e.manager_id ?? null,
        accessLevel: (e.access_level ?? "staff") as AccessLevel,
        isAdmin: l?.active_role === "hr",
        login: !l ? "none" : banned.has(l.id) ? "disabled" : l.accepted_at ? "active" : "pending",
      }
    }),
  }
}

