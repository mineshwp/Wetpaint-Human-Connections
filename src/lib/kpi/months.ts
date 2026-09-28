// Month / quarter helpers (server and client safe). Month keys are "YYYY-MM".

/** "2026-10" for a date (local calendar). */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

/** The stored date for a month key. */
export function monthStart(key: string): string {
  return `${key}-01`
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("en-ZA", { month: "long", year: "numeric" })
}

/** Month keys of a KPI period like "Q2 2026" (Apr–Jun). */
export function periodMonths(period: string): string[] {
  const m = /^Q([1-4])\s+(\d{4})$/.exec(period.trim())
  if (!m) return []
  const q = Number(m[1])
  const y = Number(m[2])
  return [0, 1, 2].map((i) => monthKey(new Date(y, (q - 1) * 3 + i, 1)))
}
