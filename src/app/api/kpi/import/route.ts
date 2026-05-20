import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js"
import { getUserRole } from "@/lib/auth"
import path from "path"
import fs from "fs"

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmployeeRow {
  id: string
  first_name: string
  last_name: string
  employee_number: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseEmployeeNumber(b4Value: unknown): string | null {
  if (!b4Value) return null
  const m = String(b4Value).match(/\(([A-Z0-9]+)\)/)
  return m ? m[1].toUpperCase() : null
}

function parseScorerName(cellValue: unknown): string | null {
  if (!cellValue) return null
  const text = String(cellValue).trim()
  const token = text.split(/\s*[-–]\s*|\s+/)[0]
  return token?.trim() || null
}

function safeInt(value: unknown): number | null {
  const n = Number(value)
  return isNaN(n) ? null : Math.round(n)
}

const MANAGEMENT_SCORERS = new Set(["ujala", "petra", "manager", "line"])

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const supabaseAdmin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Dynamically import xlsx — it's an optional dependency
  let XLSX: typeof import("xlsx")
  try {
    XLSX = await import("xlsx")
  } catch {
    return NextResponse.json({ error: "xlsx package not installed. Run: npm install xlsx" }, { status: 500 })
  }

  const KPI_DIR = path.join(process.cwd(), "supplied-by-hr", "KPIS 2026")
  if (!fs.existsSync(KPI_DIR)) {
    return NextResponse.json({ error: `KPI directory not found: ${KPI_DIR}` }, { status: 404 })
  }

  // Section definitions
  const SECTIONS_META = [
    { title: "KPI FOCUS AREAS: PERSONAL & DEPARTMENT", type: "invitee", position: 1 },
    { title: "OUR VALUES : TRIBE CONTRACT",            type: "invitee", position: 2 },
    { title: "HR AREAS: TRIBE CONTRACT",               type: "hr",      position: 3 },
  ]

  // Row layout per section index (1-based Excel rows)
  const SECTION_ROWS: Record<number, { header: number; items: number[] }> = {
    0: { header: 14, items: [15, 16, 17] },
    1: { header: 21, items: [22, 23, 24, 25] },
    2: { header: 28, items: [29, 30, 31, 32, 33, 34, 35] },
  }

  // Step 1: Ensure template sections exist
  const sectionIds: string[] = []
  for (const meta of SECTIONS_META) {
    const { data: existing } = await supabaseAdmin
      .from("kpi_template_sections")
      .select("id")
      .eq("title", meta.title)
      .limit(1)

    if (existing && existing.length > 0) {
      sectionIds.push(existing[0].id)
    } else {
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("kpi_template_sections")
        .insert({ title: meta.title, type: meta.type, position: meta.position, is_active: true })
        .select("id")
        .single()
      if (insErr || !inserted) {
        return NextResponse.json({ error: `Failed to create section: ${meta.title}` }, { status: 500 })
      }
      sectionIds.push(inserted.id)
    }
  }

  // Step 2: Load employee lookup tables
  const { data: allEmps } = await supabaseAdmin
    .from("employees")
    .select("id,first_name,last_name,employee_number")

  const byNumber: Record<string, EmployeeRow> = {}
  const byFirst: Record<string, EmployeeRow>  = {}

  for (const emp of (allEmps ?? []) as EmployeeRow[]) {
    const num = (emp.employee_number ?? "").toUpperCase().trim()
    if (num) byNumber[num] = emp
    const firstWord = (emp.first_name ?? "").split(" ")[0]?.toLowerCase()
    if (firstWord && !byFirst[firstWord]) byFirst[firstWord] = emp
  }

  function resolveEmployee(folderName: string, b4Value: unknown): EmployeeRow | null {
    const num = parseEmployeeNumber(b4Value)
    if (num && byNumber[num]) return byNumber[num]
    return byFirst[folderName.toLowerCase()] ?? null
  }

  function resolveScorer(name: string | null): string | null {
    if (!name) return null
    const key = name.toLowerCase()
    if (MANAGEMENT_SCORERS.has(key)) return null
    return byFirst[key]?.id ?? null
  }

  async function upsertItem(sectionId: string, title: string, description: string, position: number): Promise<string> {
    const { data: existing } = await supabaseAdmin
      .from("kpi_template_items")
      .select("id")
      .eq("section_id", sectionId)
      .eq("title", title)
      .limit(1)
    if (existing && existing.length > 0) return existing[0].id
    const { data: inserted } = await supabaseAdmin
      .from("kpi_template_items")
      .insert({ section_id: sectionId, title, description: description || null, min_score: 0, max_score: 10, position, is_active: true })
      .select("id")
      .single()
    return inserted?.id ?? ""
  }

  async function upsertReview(employeeId: string, period: string): Promise<string | null> {
    const { data: existing } = await supabaseAdmin
      .from("kpi_reviews")
      .select("id")
      .eq("employee_id", employeeId)
      .eq("period", period)
      .limit(1)
    if (existing && existing.length > 0) return null // already exists, skip
    const { data: inserted } = await supabaseAdmin
      .from("kpi_reviews")
      .insert({ employee_id: employeeId, period, title: `KPI Review – ${period}`, status: "draft", deadline: null })
      .select("id")
      .single()
    return inserted?.id ?? null
  }

  async function upsertInvitee(reviewId: string, inviteeId: string): Promise<void> {
    await supabaseAdmin
      .from("kpi_review_invitees")
      .upsert({ review_id: reviewId, invitee_id: inviteeId, status: "completed" }, { onConflict: "review_id,invitee_id" })
  }

  async function upsertScore(reviewId: string, itemId: string, scorerId: string | null, score: number): Promise<void> {
    if (scorerId !== null) {
      await supabaseAdmin
        .from("kpi_scores")
        .upsert({ review_id: reviewId, item_id: itemId, scorer_id: scorerId, score, comments: null }, { onConflict: "review_id,item_id,scorer_id" })
    } else {
      const { data: existing } = await supabaseAdmin
        .from("kpi_scores")
        .select("id")
        .eq("review_id", reviewId)
        .eq("item_id", itemId)
        .is("scorer_id", null)
        .limit(1)
      if (existing && existing.length > 0) {
        await supabaseAdmin.from("kpi_scores").update({ score, comments: null }).eq("id", existing[0].id)
      } else {
        await supabaseAdmin.from("kpi_scores").insert({ review_id: reviewId, item_id: itemId, scorer_id: null, score, comments: null })
      }
    }
  }

  // Step 3: Process each staff folder
  const staffFolders = fs.readdirSync(KPI_DIR).filter(name => {
    return fs.statSync(path.join(KPI_DIR, name)).isDirectory()
  }).sort()

  let processed = 0; let skipped = 0; let totalScores = 0
  const log: string[] = []
  const sharedItemIds: Record<string, string> = {} // "(secIdx,pos)" → item_id

  for (const folderName of staffFolders) {
    const xlsxPath = path.join(KPI_DIR, folderName, `${folderName} 2026 KPI Doc.xlsx`)
    if (!fs.existsSync(xlsxPath)) {
      log.push(`SKIP ${folderName}: xlsx not found`)
      skipped++
      continue
    }

    try {
      const wb = XLSX.readFile(xlsxPath, { cellFormula: false, cellHTML: false, dense: true })
      const wsName = wb.SheetNames.find(n => /template\s*26/i.test(n)) ?? wb.SheetNames[0]
      const ws = wb.Sheets[wsName]
      if (!ws) { log.push(`SKIP ${folderName}: sheet not found`); skipped++; continue }

      // Helper: read a cell value (dense array mode: ws[row][col])
      function cell(row: number, col: number): unknown {
        // xlsx dense mode: Sheets[name] is array of arrays, 0-indexed
        const r = (ws as unknown as { "!data"?: unknown[][] })["!data"]
        if (r) {
          const rowArr = r[row - 1]
          if (!rowArr) return undefined
          const c = (rowArr as Array<{ v: unknown }>)[col - 1]
          return c?.v
        }
        // fallback sparse mode
        const addr = XLSX.utils.encode_cell({ r: row - 1, c: col - 1 })
        return (ws as Record<string, { v: unknown }>)[addr]?.v
      }

      const b4 = cell(4, 2)
      const period = String(cell(7, 2) ?? "").trim()
      if (!period) { log.push(`SKIP ${folderName}: no period in B7`); skipped++; continue }

      const emp = resolveEmployee(folderName, b4)
      if (!emp) { log.push(`SKIP ${folderName}: employee not found in Supabase`); skipped++; continue }

      const reviewId = await upsertReview(emp.id, period)
      if (!reviewId) { log.push(`SKIP ${folderName}: review already exists for ${period}`); skipped++; continue }

      const inviteesAdded = new Set<string>()

      for (const [secIdxStr, rows] of Object.entries(SECTION_ROWS)) {
        const secIdx = Number(secIdxStr)
        const sectionId = sectionIds[secIdx]

        const cName = parseScorerName(cell(rows.header, 3))
        const gName = parseScorerName(cell(rows.header, 7))
        const cScorerId = resolveScorer(cName)
        const gScorerId = resolveScorer(gName)

        // Add non-management scorers as invitees
        for (const sid of [cScorerId, gScorerId]) {
          if (sid && sid !== emp.id && !inviteesAdded.has(sid)) {
            inviteesAdded.add(sid)
            await upsertInvitee(reviewId, sid)
          }
        }

        for (let posIdx = 0; posIdx < rows.items.length; posIdx++) {
          const itemRow = rows.items[posIdx]
          const title = String(cell(itemRow, 1) ?? "").trim()
          const description = String(cell(itemRow, 2) ?? "").trim()
          const cScore = safeInt(cell(itemRow, 3))
          const gScore = safeInt(cell(itemRow, 7))

          if (!title) continue

          let itemId: string
          if (secIdx === 0) {
            // Personal section — unique per employee
            itemId = await upsertItem(sectionId, title, description, posIdx + 1)
          } else {
            // Shared sections — cache after first insert
            const cacheKey = `${secIdx},${posIdx}`
            if (sharedItemIds[cacheKey]) {
              itemId = sharedItemIds[cacheKey]
            } else {
              itemId = await upsertItem(sectionId, title, description, posIdx + 1)
              sharedItemIds[cacheKey] = itemId
            }
          }

          if (cScore !== null) { await upsertScore(reviewId, itemId, cScorerId, cScore); totalScores++ }
          if (gScore !== null) { await upsertScore(reviewId, itemId, gScorerId, gScore); totalScores++ }
        }
      }

      log.push(`OK ${folderName}: ${period}, ${inviteesAdded.size} invitees`)
      processed++
    } catch (err) {
      log.push(`ERROR ${folderName}: ${err instanceof Error ? err.message : String(err)}`)
      skipped++
    }
  }

  return NextResponse.json({
    message: `Import complete: ${processed} reviews created, ${totalScores} scores written, ${skipped} skipped`,
    log,
  })
}
