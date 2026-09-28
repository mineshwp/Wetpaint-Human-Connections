// Monthly manager check-ins — shared helpers (server and client safe).
//
// A check-in covers one calendar month ("YYYY-MM", stored as the 1st). Heads
// and managers can write it during that month and until the 10th of the next
// month; after that only HR can change it (same idea as the KPI publish lock).

export type CheckinStatus = "on_track" | "needs_support" | "concern"

export const CHECKIN_STATUSES: { value: CheckinStatus; label: string; cls: string }[] = [
  { value: "on_track", label: "On track", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "needs_support", label: "Needs support", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "concern", label: "Concern", cls: "bg-red-50 text-red-700 border-red-200" },
]

export const CHECKIN_CLOSE_DAY = 10

export function isCheckinStatus(v: unknown): v is CheckinStatus {
  return v === "on_track" || v === "needs_support" || v === "concern"
}

/** "2026-10" for a date (local calendar). */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

export function isMonthKey(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v)
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number)
  return monthKey(new Date(y, m - 1 + delta, 1))
}

/** The stored date for a month key. */
export function monthStart(key: string): string {
  return `${key}-01`
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("en-ZA", { month: "long", year: "numeric" })
}

/**
 * The month managers should be working on: last month until the window closes on
 * the 10th, then the current month.
 */
export function defaultCheckinMonth(now = new Date()): string {
  const current = monthKey(now)
  return now.getDate() <= CHECKIN_CLOSE_DAY ? shiftMonth(current, -1) : current
}

/** Whether a manager may still write this month's check-in. */
export function isCheckinWindowOpen(key: string, now = new Date()): boolean {
  const current = monthKey(now)
  if (key === current) return true
  return key === shiftMonth(current, -1) && now.getDate() <= CHECKIN_CLOSE_DAY
}

/** Date the window closes, e.g. "10 November 2026". */
export function checkinDeadlineLabel(key: string): string {
  const [y, m] = shiftMonth(key, 1).split("-").map(Number)
  return new Date(y, m - 1, CHECKIN_CLOSE_DAY).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
}

/** Month keys of a KPI period like "Q2 2026" (Apr–Jun). */
export function periodMonths(period: string): string[] {
  const m = /^Q([1-4])\s+(\d{4})$/.exec(period.trim())
  if (!m) return []
  const q = Number(m[1])
  const y = Number(m[2])
  return [0, 1, 2].map((i) => monthKey(new Date(y, (q - 1) * 3 + i, 1)))
}
