import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"

// Imports the per-staff workbook produced by /api/kpi/staff-workbook/export.
// One worksheet per employee; each data row is a KPI item with Q1–Q4 score +
// comment columns. For every (employee, quarter) that has any score/comment we
// ensure a draft review exists, then upsert the HR/Admin score (scorer_id null)
// for each item. Re-importing the same file is idempotent (updates in place).

const YEAR = 2026

function norm(s: unknown): string {
  return String(s ?? "").toLowerCase().trim().replace(/\s+/g, " ")
}

// "Q1 2026", "Quarter 1 - 2026", etc → 1..4
function periodToQuarter(period: string): number | null {
  const m = period.match(/q(?:uarter)?\s*(\d)/i)
  if (m) { const q = parseInt(m[1]); if (q >= 1 && q <= 4) return q }
  return null
}

// Score cell: blank → null; otherwise a finite number snapped to 0.5 steps.
function parseScore(raw: unknown): number | null | "invalid" {
  const s = String(raw ?? "").trim()
  if (s === "") return null
  const n = Number(s)
  if (!Number.isFinite(n)) return "invalid"
  return Math.round(n * 2) / 2
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const form = await req.formData()
  const file = form.get("file")
  if (!(file instanceof Blob)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 })

  const XLSX = await import("xlsx")
  let wb: import("xlsx").WorkBook
  try {
    const buf = new Uint8Array(await file.arrayBuffer())
    wb = XLSX.read(buf, { type: "array" })
  } catch (e) {
    console.error("[POST /api/kpi/staff-workbook/import] parse", e)
    return NextResponse.json({ error: "Could not parse the file. Use the exported workbook layout." }, { status: 400 })
  }

  // --- Prefetch lookups -----------------------------------------------------
  const [{ data: itemRows }, { data: emps }] = await Promise.all([
    supabase.from("kpi_template_items").select("id, section_id, title, section:kpi_template_sections(title)").is("review_id", null),
    supabase.from("employees").select("id, first_name, last_name, email"),
  ])

  const itemSection = new Map<string, string>() // item_id → section_id
  const itemByTitle = new Map<string, string>() // "section|item" (normalized) → item_id
  for (const it of itemRows ?? []) {
    itemSection.set(it.id, it.section_id)
    const sec = Array.isArray(it.section) ? it.section[0] : it.section
    itemByTitle.set(`${norm(sec?.title)}|${norm(it.title)}`, it.id)
  }

  const empById = new Map<string, { name: string }>()
  const empByEmail = new Map<string, string>()
  const empByName = new Map<string, string>()
  for (const e of emps ?? []) {
    const name = `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim()
    empById.set(e.id, { name })
    if (e.email) empByEmail.set(e.email.toLowerCase(), e.id)
    if (name) empByName.set(norm(name), e.id)
  }

  // Existing reviews grouped by employee → quarter → review_id.
  const { data: existingReviews } = await supabase
    .from("kpi_reviews")
    .select("id, employee_id, period")
  const reviewByEmpQuarter = new Map<string, string>() // `${empId}::${q}` → reviewId
  for (const r of existingReviews ?? []) {
    const q = periodToQuarter(r.period ?? "")
    if (q) reviewByEmpQuarter.set(`${r.employee_id}::${q}`, r.id)
  }

  async function ensureReview(empId: string, quarter: number): Promise<string> {
    const key = `${empId}::${quarter}`
    const cached = reviewByEmpQuarter.get(key)
    if (cached) return cached
    const name = empById.get(empId)?.name || "Staff"
    const { data: created, error } = await supabase
      .from("kpi_reviews")
      .insert({
        employee_id: empId,
        period: `Q${quarter} ${YEAR}`,
        title: `${name} — Q${quarter} ${YEAR} Review`,
        status: "draft",
      })
      .select("id")
      .single()
    if (error || !created) throw new Error(error?.message ?? "review insert failed")
    reviewByEmpQuarter.set(key, created.id)
    reviewsCreated++
    return created.id
  }

  // Manual upsert of the HR/Admin score (scorer_id null) for a review+item.
  async function upsertHrScore(reviewId: string, itemId: string, score: number | null, comments: string) {
    const { data: existing } = await supabase
      .from("kpi_scores")
      .select("id")
      .eq("review_id", reviewId)
      .eq("item_id", itemId)
      .is("scorer_id", null)
      .maybeSingle()
    if (existing) {
      return supabase.from("kpi_scores")
        .update({ score, comments: comments || null, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
    }
    return supabase.from("kpi_scores")
      .insert({ review_id: reviewId, item_id: itemId, scorer_id: null, score, comments: comments || null })
  }

  // --- Walk every sheet -----------------------------------------------------
  let reviewsCreated = 0, scoresUpserted = 0, sheetsProcessed = 0, skipped = 0
  const errors: string[] = []
  const QUARTERS = [1, 2, 3, 4]

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    if (!ws) continue
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: "" })
    if (!grid.length) continue

    // Identify the employee from the metadata rows (employee_id > email > name).
    let empId: string | null = null
    for (const row of grid.slice(0, 6)) {
      const label = norm(row[0])
      const val = String(row[1] ?? "").trim()
      if (label === "employee_id" && val && empById.has(val)) { empId = val; break }
      if (label === "email" && val && empByEmail.has(val.toLowerCase())) { empId = empByEmail.get(val.toLowerCase())!; break }
      if (label === "employee" && val && empByName.has(norm(val))) { empId = empByName.get(norm(val))! }
    }
    if (!empId) { errors.push(`Tab "${sheetName}": couldn't match to an employee — skipped`); continue }

    // Find the header row (contains a "KPI Item" cell) and map columns by name.
    let headerIdx = -1
    for (let i = 0; i < grid.length; i++) {
      if (grid[i].some((c) => norm(c) === "kpi item")) { headerIdx = i; break }
    }
    if (headerIdx === -1) { errors.push(`Tab "${sheetName}": no header row found — skipped`); continue }

    const col = new Map<string, number>()
    grid[headerIdx].forEach((c, i) => { const k = norm(c); if (k) col.set(k, i) })
    const cSection = col.get("section")
    const cItem = col.get("kpi item")
    const cItemId = col.get("item_id")

    let sheetTouched = false
    for (let i = headerIdx + 1; i < grid.length; i++) {
      const row = grid[i]
      // Resolve the KPI item: item_id first, then section+title fallback.
      let itemId = cItemId !== undefined ? String(row[cItemId] ?? "").trim() : ""
      if (!itemId || !itemSection.has(itemId)) {
        const secTitle = cSection !== undefined ? row[cSection] : ""
        const itemTitle = cItem !== undefined ? row[cItem] : ""
        const byTitle = itemByTitle.get(`${norm(secTitle)}|${norm(itemTitle)}`)
        itemId = byTitle ?? ""
      }
      if (!itemId || !itemSection.has(itemId)) continue // not a KPI data row

      for (const q of QUARTERS) {
        const cScore = col.get(`q${q} score`)
        const cComment = col.get(`q${q} comment`)
        const scoreRaw = cScore !== undefined ? row[cScore] : ""
        const comment = cComment !== undefined ? String(row[cComment] ?? "").trim() : ""
        const parsed = parseScore(scoreRaw)
        if (parsed === "invalid") { errors.push(`Tab "${sheetName}" row ${i + 1}: Q${q} score "${String(scoreRaw)}" is not a number`); continue }
        if (parsed === null && !comment) { continue } // blank cell — nothing to save

        try {
          const reviewId = await ensureReview(empId, q)
          const { error } = await upsertHrScore(reviewId, itemId, parsed, comment)
          if (error) { errors.push(`Tab "${sheetName}" row ${i + 1} Q${q}: ${error.message}`); continue }
          scoresUpserted++
          sheetTouched = true
        } catch (e) {
          errors.push(`Tab "${sheetName}" row ${i + 1} Q${q}: ${(e as Error).message}`)
        }
      }
    }
    if (sheetTouched) sheetsProcessed++
    else skipped++
  }

  const parts = [
    `${scoresUpserted} score(s) saved`,
    `${reviewsCreated} review(s) created`,
    `${sheetsProcessed} staff tab(s) with data`,
    skipped ? `${skipped} empty tab(s) skipped` : "",
    errors.length ? `${errors.length} issue(s)` : "",
  ].filter(Boolean)

  return NextResponse.json({
    message: `Imported: ${parts.join(" · ")}`,
    scoresUpserted, reviewsCreated, sheetsProcessed, skipped, errors,
  })
}
