import { reportingLine } from "@/lib/reporting-line"
import type { AccessLevel } from "@/lib/access-levels"

// Browser-safe types and rules for Settings → Who can see what. The data is
// loaded server-side in lib/access-overview.ts.

export type AccessPerson = {
  id: string
  name: string
  jobTitle: string | null
  departmentId: string | null
  managerId: string | null
  accessLevel: AccessLevel
  isAdmin: boolean
  login: "none" | "pending" | "active" | "disabled"
}

export type AccessData = {
  people: AccessPerson[]
  departments: { id: string; name: string }[]
}

/** Who each person can see, by the same rules as getTeamScope / hc_can_see_employee. */
export function visibleTo(person: AccessPerson, people: AccessPerson[]): string[] | "everyone" {
  if (person.isAdmin) return "everyone"
  switch (person.accessLevel) {
    case "manager_reports":
      return people.filter((p) => p.managerId === person.id && p.id !== person.id).map((p) => p.id)
    case "manager_line":
      return reportingLine(people.map((p) => ({ id: p.id, manager_id: p.managerId })), person.id)
    case "manager_department":
      return person.departmentId
        ? people.filter((p) => p.departmentId === person.departmentId && p.id !== person.id).map((p) => p.id)
        : []
    default:
      return []
  }
}
