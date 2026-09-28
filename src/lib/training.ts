import type { SupabaseClient } from "@supabase/supabase-js"

// Training tracker queries shared by the tracker page, the quarterly report and
// the weekly HR reminder. Callers must have checked the viewer is HR.

export const EXPIRY_WARNING_DAYS = 60

export type TrainingRow = {
  id: string
  employeeId: string
  employeeName: string
  department: string | null
  name: string
  provider: string | null
  category: string | null
  dateCompleted: string | null
  expiryDate: string | null
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function addDays(d: Date, days: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
}

/** Every training record for staff who aren't archived, newest first. */
export async function loadTraining(supabase: SupabaseClient): Promise<TrainingRow[]> {
  const { data, error } = await supabase
    .from("employee_training")
    .select("id, employee_id, name, provider, category, date_completed, expiry_date, employee:employees!inner(first_name, last_name, is_archived, department:departments(name))")
    .eq("employee.is_archived", false)
    .order("date_completed", { ascending: false, nullsFirst: false })
  if (error) throw new Error(error.message)

  type Emp = { first_name: string; last_name: string; department: { name: string } | null }
  return (data ?? []).map((r) => {
    const e = r.employee as unknown as Emp
    return {
      id: r.id,
      employeeId: r.employee_id,
      employeeName: `${e.first_name} ${e.last_name}`.trim(),
      department: e.department?.name ?? null,
      name: r.name,
      provider: r.provider,
      category: r.category,
      dateCompleted: r.date_completed,
      expiryDate: r.expiry_date,
    }
  })
}

/** Split into expired, expiring soon (within `days`) and the rest. */
export function groupByExpiry(rows: TrainingRow[], today = new Date(), days = EXPIRY_WARNING_DAYS) {
  const t = isoDate(today)
  const soon = isoDate(addDays(today, days))
  const expired = rows.filter((r) => r.expiryDate && r.expiryDate < t)
    .sort((a, b) => (a.expiryDate! < b.expiryDate! ? 1 : -1))
  const expiring = rows.filter((r) => r.expiryDate && r.expiryDate >= t && r.expiryDate <= soon)
    .sort((a, b) => (a.expiryDate! < b.expiryDate! ? -1 : 1))
  return { expired, expiring }
}
