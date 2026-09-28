import type { UserRole } from "./types"

// What a person can see in the portal. Stored on the employee
// (employees.access_level), so HR can set it before they have a login.
// HR admins are separate (app_users.active_role = "hr", Settings → Administrators).
export type AccessLevel = "staff" | "manager_reports" | "manager_line" | "manager_department"

export const ACCESS_LEVELS: { value: AccessLevel; label: string; short: string; help: string }[] = [
  { value: "staff", label: "Staff", short: "Staff", help: "Own profile only" },
  { value: "manager_reports", label: "Manager — direct reports", short: "Manager · direct reports", help: "People whose Reports to is them" },
  { value: "manager_line", label: "Manager — whole reporting line", short: "Manager · reporting line", help: "Their reports, their reports' reports, and so on" },
  { value: "manager_department", label: "Manager — whole department", short: "Manager · department", help: "Everyone in their department" },
]

export function isAccessLevel(v: unknown): v is AccessLevel {
  return v === "staff" || v === "manager_reports" || v === "manager_line" || v === "manager_department"
}

export function accessLabel(v: string | null | undefined): string {
  return ACCESS_LEVELS.find((a) => a.value === v)?.short ?? "Staff"
}

/** Role from the login's stored role + the employee's access level. */
export function resolveRole(storedRole: UserRole | null, accessLevel: string | null | undefined): UserRole | null {
  if (storedRole === "hr" || storedRole === "applicant" || storedRole === null) return storedRole
  return accessLevel && accessLevel !== "staff" ? "manager" : "staff"
}
