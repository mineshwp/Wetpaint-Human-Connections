import { createClient } from "@/lib/supabase/server"

type DB = Awaited<ReturnType<typeof createClient>>

export function parsePeriod(period: string | null | undefined): { year: number; quarter: number } | null {
  if (!period) return null
  const m = period.match(/Q\s*(\d)\D+(\d{4})/i)
  if (!m) return null
  return { quarter: parseInt(m[1], 10), year: parseInt(m[2], 10) }
}

// The period a new review should inherit from:
//  1. same-year Q1 if a template exists for it;
//  2. else the earliest-quarter period of the same year that is before the
//     target (so the earliest quarter is itself a baseline);
//  3. else — for a brand-new year — the latest period of the most recent
//     PRIOR year, so starting e.g. Q1 2027 carries forward the 2026 template.
// Returns null when there's nothing to inherit.
export async function resolveBaselinePeriod(supabase: DB, targetPeriod: string): Promise<string | null> {
  const t = parsePeriod(targetPeriod)
  if (!t) return null

  const { data } = await supabase
    .from("kpi_template_sections")
    .select("period")
    .eq("is_active", true)

  const periods = Array.from(new Set((data ?? []).map((r) => r.period).filter(Boolean) as string[]))
    .map((p) => ({ p, pp: parsePeriod(p) }))
    .filter((x): x is { p: string; pp: { year: number; quarter: number } } => x.pp !== null)

  const sameYearEarlier = periods.filter((x) => x.pp.year === t.year && x.pp.quarter < t.quarter)
  if (sameYearEarlier.length > 0) {
    const q1 = sameYearEarlier.find((x) => x.pp.quarter === 1)
    if (q1) return q1.p
    return sameYearEarlier.sort((a, b) => a.pp.quarter - b.pp.quarter)[0].p
  }

  // Brand-new year: fall back to the latest period of the most recent prior year.
  const priorYears = periods.filter((x) => x.pp.year < t.year)
  if (priorYears.length > 0) {
    priorYears.sort((a, b) => b.pp.year - a.pp.year || b.pp.quarter - a.pp.quarter)
    return priorYears[0].p
  }

  return null
}

// Clone a period's template STRUCTURE (sections + global KPI items) into a
// target period if the target has no active sections yet. Returns the number of
// sections created (0 if the target already had a template or the source was
// empty).
export async function ensurePeriodTemplate(supabase: DB, fromPeriod: string, toPeriod: string): Promise<number> {
  if (fromPeriod === toPeriod) return 0

  const { data: existingDst } = await supabase
    .from("kpi_template_sections")
    .select("id")
    .eq("period", toPeriod)
    .eq("is_active", true)
    .limit(1)
  if (existingDst && existingDst.length > 0) return 0

  const { data: src } = await supabase
    .from("kpi_template_sections")
    .select("title, type, position, kpi_template_items(title, description, min_score, max_score, position, is_active, review_id)")
    .eq("period", fromPeriod)
    .eq("is_active", true)
    .order("position")
  if (!src || src.length === 0) return 0

  let created = 0
  for (const sec of src) {
    const { data: newSec, error } = await supabase
      .from("kpi_template_sections")
      .insert({ title: sec.title, type: sec.type, position: sec.position, is_active: true, period: toPeriod })
      .select("id")
      .single()
    if (error || !newSec) continue

    const items = (sec.kpi_template_items ?? [])
      .filter((i: { is_active: boolean; review_id: string | null }) => i.is_active && !i.review_id)
      .map((i: { title: string; description: string | null; min_score: number; max_score: number; position: number }) => ({
        section_id: newSec.id,
        title: i.title,
        description: i.description ?? null,
        min_score: i.min_score,
        max_score: i.max_score,
        position: i.position,
        is_active: true,
        review_id: null,
      }))
    if (items.length > 0) await supabase.from("kpi_template_items").insert(items)
    created++
  }
  return created
}

// Copy a staff member's per-review custom KPIs (title/description/min/max only)
// from a source review into a target review, across ALL sections, matching
// sections by title. Skips items whose title already exists in the target
// section. Never touches scores or comments. Returns the number copied.
export async function copyStaffCustomItems(
  supabase: DB,
  targetReviewId: string,
  targetPeriod: string,
  fromReviewId: string,
  fromPeriod: string,
): Promise<number> {
  if (targetReviewId === fromReviewId) return 0

  const [{ data: targetSections }, { data: srcSections }] = await Promise.all([
    supabase.from("kpi_template_sections").select("id, title").eq("period", targetPeriod).eq("is_active", true),
    supabase.from("kpi_template_sections").select("id, title").eq("period", fromPeriod).eq("is_active", true),
  ])

  const targetByTitle = new Map<string, string>()
  for (const s of targetSections ?? []) targetByTitle.set((s.title ?? "").trim().toLowerCase(), s.id)
  const srcTitleById = new Map<string, string>()
  for (const s of srcSections ?? []) srcTitleById.set(s.id, (s.title ?? "").trim().toLowerCase())
  const srcSectionIds = Array.from(srcTitleById.keys())
  if (srcSectionIds.length === 0) return 0

  const { data: srcItems } = await supabase
    .from("kpi_template_items")
    .select("title, description, min_score, max_score, position, section_id")
    .eq("review_id", fromReviewId)
    .eq("is_active", true)
    .in("section_id", srcSectionIds)
    .order("position")
  if (!srcItems || srcItems.length === 0) return 0

  // Existing target custom items, so we skip duplicate titles and append after
  // the current highest position per target section.
  const { data: existing } = await supabase
    .from("kpi_template_items")
    .select("title, position, section_id")
    .eq("review_id", targetReviewId)
    .eq("is_active", true)
  const existingKey = new Set<string>()
  const nextPos = new Map<string, number>()
  for (const i of existing ?? []) {
    existingKey.add(`${i.section_id}::${(i.title ?? "").trim().toLowerCase()}`)
    nextPos.set(i.section_id, Math.max(nextPos.get(i.section_id) ?? -1, i.position ?? 0))
  }

  const toInsert: Record<string, unknown>[] = []
  for (const item of srcItems) {
    const title = srcTitleById.get(item.section_id)
    if (!title) continue
    const targetSectionId = targetByTitle.get(title)
    if (!targetSectionId) continue
    const key = `${targetSectionId}::${(item.title ?? "").trim().toLowerCase()}`
    if (existingKey.has(key)) continue
    existingKey.add(key)
    const pos = (nextPos.get(targetSectionId) ?? -1) + 1
    nextPos.set(targetSectionId, pos)
    toInsert.push({
      section_id: targetSectionId,
      review_id: targetReviewId,
      title: item.title,
      description: item.description ?? null,
      min_score: item.min_score,
      max_score: item.max_score,
      position: pos,
      is_active: true,
    })
  }

  if (toInsert.length === 0) return 0
  const { error } = await supabase.from("kpi_template_items").insert(toInsert)
  if (error) {
    console.error("[copyStaffCustomItems] insert", error)
    return 0
  }
  return toInsert.length
}

// Full inheritance for a newly-created review: ensure the target period has a
// template (cloned from its baseline), then copy the staff member's custom KPIs
// from their baseline-quarter review. Best-effort — never throws.
export async function inheritForNewReview(
  supabase: DB,
  review: { id: string; employee_id: string; period: string },
): Promise<{ baseline: string | null; sectionsCreated: number; itemsCopied: number }> {
  const result = { baseline: null as string | null, sectionsCreated: 0, itemsCopied: 0 }
  try {
    const baseline = await resolveBaselinePeriod(supabase, review.period)
    if (!baseline) return result
    result.baseline = baseline

    result.sectionsCreated = await ensurePeriodTemplate(supabase, baseline, review.period)

    const { data: baseReviews } = await supabase
      .from("kpi_reviews")
      .select("id")
      .eq("employee_id", review.employee_id)
      .eq("period", baseline)
      .eq("is_archived", false)
      .order("created_at", { ascending: true })
      .limit(1)
    const baseReview = baseReviews?.[0]
    if (baseReview) {
      result.itemsCopied = await copyStaffCustomItems(supabase, review.id, review.period, baseReview.id, baseline)
    }
  } catch (e) {
    console.error("[inheritForNewReview]", e)
  }
  return result
}
