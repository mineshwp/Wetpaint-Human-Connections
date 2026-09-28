// Everyone below a manager in the reporting line ("Reports to" chains),
// excluding the manager. Cycle-safe. Mirrors the database's hc_reporting_line.
export function reportingLine(
  rows: { id: string; manager_id: string | null }[],
  managerId: string
): string[] {
  const byManager = new Map<string, string[]>()
  for (const r of rows) {
    if (!r.manager_id) continue
    byManager.set(r.manager_id, [...(byManager.get(r.manager_id) ?? []), r.id])
  }
  const seen = new Set<string>([managerId])
  const out: string[] = []
  const queue = [...(byManager.get(managerId) ?? [])]
  while (queue.length) {
    const id = queue.shift()!
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
    queue.push(...(byManager.get(id) ?? []))
  }
  return out
}
