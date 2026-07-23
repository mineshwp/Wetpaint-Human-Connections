import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"

// Merge/update import of staff KPI scores, reviewers and final comments from the
// round-trip CSV/XLSX produced by the export route. Matching is by review_id +
// item_id + scorer (email, or "HR/Admin" for the null HR score). A scorer whose
// email isn't yet a reviewer on the review is auto-added silently (no email) and
// assigned to the KPI's section, matching the backdated bulk-entry workflow.

type RawRow = Record<string, unknown>

function pick(row: Record<string, unknown>, key: string): string {
  const v = row[key]
  return v === undefined || v === null ? "" : String(v).trim()
}

// Parse a score cell: blank → null; otherwise a number snapped to 0.5 steps.
function parseScore(raw: string): number | null | "invalid" {
  if (raw === "") return null
  const n = Number(raw)
  if (!Number.isFinite(n)) return "invalid"
  return Math.round(n * 2) / 2
}

function isHrScorer(scorer: string, scorerEmail: string): boolean {
  if (scorerEmail) return false
  const s = scorer.toLowerCase().replace(/[\s/]+/g, "")
  return s === "" || s === "hr" || s === "hradmin" || s === "admin"
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
  let rawRows: RawRow[]
  try {
    const buf = new Uint8Array(await file.arrayBuffer())
    const wb = XLSX.read(buf, { type: "array" })
    const ws = wb.Sheets[wb.SheetNames[0]]
    if (!ws) return NextResponse.json({ error: "The file has no readable sheet" }, { status: 400 })
    rawRows = XLSX.utils.sheet_to_json<RawRow>(ws, { defval: "" })
  } catch (e) {
    console.error("[POST /api/kpi/staff-scores/import] parse", e)
    return NextResponse.json({ error: "Could not parse the file. Use the exported CSV/XLSX layout." }, { status: 400 })
  }

  // Normalize header keys to lowercase snake.
  const rows = rawRows.map((r) => {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(r)) out[k.toLowerCase().trim().replace(/\s+/g, "_")] = v
    return out
  })

  // --- Prefetch lookups -----------------------------------------------------
  const reviewIds = Array.from(new Set(rows.map((r) => pick(r, "review_id")).filter(Boolean)))
  const itemIds = Array.from(new Set(rows.map((r) => pick(r, "item_id")).filter(Boolean)))

  const [{ data: validReviews }, { data: itemRows }, { data: emps }] = await Promise.all([
    reviewIds.length
      ? supabase.from("kpi_reviews").select("id").in("id", reviewIds)
      : Promise.resolve({ data: [] as { id: string }[] }),
    itemIds.length
      ? supabase.from("kpi_template_items").select("id, section_id").in("id", itemIds)
      : Promise.resolve({ data: [] as { id: string; section_id: string }[] }),
    supabase.from("employees").select("id, email"),
  ])

  const validReviewSet = new Set((validReviews ?? []).map((r) => r.id))
  const itemSection = new Map<string, string>()
  for (const it of itemRows ?? []) itemSection.set(it.id, it.section_id)
  const empByEmail = new Map<string, string>()
  for (const e of emps ?? []) if (e.email) empByEmail.set(e.email.toLowerCase(), e.id)

  // --- Mutating caches ------------------------------------------------------
  // review::invitee → review_invitee_id (row ensured to exist).
  const inviteeCache = new Map<string, string>()
  const assignmentCache = new Set<string>() // review_invitee_id::section_id

  let reviewersAdded = 0, sectionsAssigned = 0

  async function ensureInvitee(reviewId: string, inviteeId: string): Promise<string> {
    const key = `${reviewId}::${inviteeId}`
    const cached = inviteeCache.get(key)
    if (cached) return cached
    const { data: existing } = await supabase
      .from("kpi_review_invitees")
      .select("id")
      .eq("review_id", reviewId)
      .eq("invitee_id", inviteeId)
      .maybeSingle()
    if (existing) { inviteeCache.set(key, existing.id); return existing.id }
    const { data: created, error } = await supabase
      .from("kpi_review_invitees")
      .insert({ review_id: reviewId, invitee_id: inviteeId, status: "completed" })
      .select("id")
      .single()
    if (error || !created) throw new Error(error?.message ?? "invitee insert failed")
    reviewersAdded++
    inviteeCache.set(key, created.id)
    return created.id
  }

  async function ensureAssignment(reviewInviteeId: string, sectionId: string): Promise<void> {
    const key = `${reviewInviteeId}::${sectionId}`
    if (assignmentCache.has(key)) return
    assignmentCache.add(key)
    const { data: existing } = await supabase
      .from("kpi_review_invitee_sections")
      .select("id")
      .eq("review_invitee_id", reviewInviteeId)
      .eq("section_id", sectionId)
      .maybeSingle()
    if (existing) return
    const { error } = await supabase
      .from("kpi_review_invitee_sections")
      .insert({ review_invitee_id: reviewInviteeId, section_id: sectionId })
    if (!error) sectionsAssigned++
  }

  // Manual upsert (null scorer_id can't be an onConflict target reliably).
  async function upsertScore(reviewId: string, itemId: string, scorerId: string | null, score: number | null, comments: string) {
    let q = supabase.from("kpi_scores").select("id").eq("review_id", reviewId).eq("item_id", itemId)
    q = scorerId ? q.eq("scorer_id", scorerId) : q.is("scorer_id", null)
    const { data: existing } = await q.maybeSingle()
    if (existing) {
      return supabase.from("kpi_scores")
        .update({ score, comments: comments || null, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
    }
    return supabase.from("kpi_scores")
      .insert({ review_id: reviewId, item_id: itemId, scorer_id: scorerId, score, comments: comments || null })
  }

  async function upsertFinalComment(reviewId: string, authorId: string | null, comment: string) {
    let q = supabase.from("kpi_final_comments").select("id").eq("review_id", reviewId)
    q = authorId ? q.eq("author_id", authorId) : q.is("author_id", null)
    const { data: existing } = await q.maybeSingle()
    if (existing) {
      return supabase.from("kpi_final_comments")
        .update({ comment, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
    }
    return supabase.from("kpi_final_comments")
      .insert({ review_id: reviewId, author_id: authorId, comment })
  }

  // --- Process rows ---------------------------------------------------------
  let scoresUpserted = 0, finalCommentsUpserted = 0, skipped = 0
  const errors: string[] = []
  const rowLabel = (i: number) => `Row ${i + 2}` // +2: header + 1-based

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const reviewId = pick(row, "review_id")
    if (!reviewId) { skipped++; continue }
    if (!validReviewSet.has(reviewId)) { errors.push(`${rowLabel(i)}: unknown review_id`); continue }

    const sectionType = pick(row, "section_type").toLowerCase()
    const itemId = pick(row, "item_id")
    const scorer = pick(row, "scorer")
    const scorerEmail = pick(row, "scorer_email").toLowerCase()
    const comments = pick(row, "comments")
    const isFinal = sectionType === "final" || (!itemId && pick(row, "section").toLowerCase() === "final comments")

    // Resolve the scorer/author (null = HR/Admin).
    let personId: string | null = null
    if (!isHrScorer(scorer, scorerEmail)) {
      if (!scorerEmail) { errors.push(`${rowLabel(i)}: scorer "${scorer}" has no email — add an email or use HR/Admin`); continue }
      const found = empByEmail.get(scorerEmail)
      if (!found) { errors.push(`${rowLabel(i)}: no employee with email ${scorerEmail}`); continue }
      personId = found
    }

    try {
      if (isFinal) {
        if (!comments) { skipped++; continue }
        if (personId) await ensureInvitee(reviewId, personId)
        const { error } = await upsertFinalComment(reviewId, personId, comments)
        if (error) { errors.push(`${rowLabel(i)}: ${error.message}`); continue }
        finalCommentsUpserted++
        continue
      }

      // Score row.
      if (!itemId) { skipped++; continue }
      const sectionId = itemSection.get(itemId)
      if (!sectionId) { errors.push(`${rowLabel(i)}: unknown item_id`); continue }

      const parsed = parseScore(pick(row, "score"))
      if (parsed === "invalid") { errors.push(`${rowLabel(i)}: score "${pick(row, "score")}" is not a number`); continue }
      // Skip exported placeholders that stayed blank.
      if (parsed === null && !comments) { skipped++; continue }

      if (personId) {
        const reviewInviteeId = await ensureInvitee(reviewId, personId)
        await ensureAssignment(reviewInviteeId, sectionId)
      }
      const { error } = await upsertScore(reviewId, itemId, personId, parsed, comments)
      if (error) { errors.push(`${rowLabel(i)}: ${error.message}`); continue }
      scoresUpserted++
    } catch (e) {
      errors.push(`${rowLabel(i)}: ${(e as Error).message}`)
    }
  }

  const parts = [
    `${scoresUpserted} score(s) saved`,
    `${finalCommentsUpserted} final comment(s)`,
    reviewersAdded ? `${reviewersAdded} reviewer(s) added` : "",
    sectionsAssigned ? `${sectionsAssigned} section assignment(s)` : "",
    skipped ? `${skipped} blank row(s) skipped` : "",
    errors.length ? `${errors.length} error(s)` : "",
  ].filter(Boolean)

  return NextResponse.json({
    message: `Imported: ${parts.join(" · ")}`,
    scoresUpserted, finalCommentsUpserted, reviewersAdded, sectionsAssigned, skipped,
    errors,
  })
}
