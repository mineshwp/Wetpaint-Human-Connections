import { createClient } from "@/lib/supabase/server"
import { generateText, loadAiSettings, type GenerateResult } from "@/lib/ai/openai"
import { DEFAULT_ACTION_POINTS_PROMPT } from "@/lib/ai/prompts"
import { createAdminClient } from "@/lib/supabase/admin"

type DB = Awaited<ReturnType<typeof createClient>>

interface Item { id: string; title: string; description: string | null; max_score: number; review_id: string | null; is_active: boolean }
interface Section { title: string; type: string; kpi_template_items: Item[] }

// Build a compact, readable breakdown of a review's KPIs, scores and comments
// to feed the model.
// Names are left out unless HR turns "Include staff names" on (Settings → AI).
async function buildContext(supabase: DB, reviewId: string, includeNames: boolean): Promise<{ employeeName: string; jobTitle: string | null; period: string; breakdown: string } | null> {
  const { data: review } = await supabase
    .from("kpi_reviews")
    .select("period, employee:employees!kpi_reviews_employee_id_fkey(first_name, last_name, job_title)")
    .eq("id", reviewId)
    .maybeSingle()
  if (!review) return null

  const emp = review.employee as unknown as { first_name: string; last_name: string; job_title: string | null } | null
  const employeeName = includeNames && emp ? `${emp.first_name} ${emp.last_name}` : "the staff member"

  const [{ data: sections }, { data: scores }, { data: finals }] = await Promise.all([
    supabase
      .from("kpi_template_sections")
      .select("title, type, kpi_template_items(id, title, description, max_score, review_id, is_active)")
      .eq("is_active", true)
      .eq("period", review.period)
      .order("position"),
    supabase.from("kpi_scores").select("item_id, score, comments").eq("review_id", reviewId),
    supabase.from("kpi_final_comments").select("comment").eq("review_id", reviewId),
  ])

  // Average submitted scores per item, and collect any comments.
  const scoreVals = new Map<string, number[]>()
  const commentsByItem = new Map<string, string[]>()
  for (const s of scores ?? []) {
    if (s.score != null) { const a = scoreVals.get(s.item_id) ?? []; a.push(s.score); scoreVals.set(s.item_id, a) }
    if (s.comments && s.comments.trim()) { const a = commentsByItem.get(s.item_id) ?? []; a.push(s.comments.trim()); commentsByItem.set(s.item_id, a) }
  }

  const lines: string[] = []
  for (const sec of (sections ?? []) as unknown as Section[]) {
    const items = (sec.kpi_template_items ?? []).filter((i) => i.is_active)
    if (items.length === 0) continue
    lines.push(`\n## ${sec.title}`)
    for (const it of items) {
      const vals = scoreVals.get(it.id) ?? []
      const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length) : null
      const scoreStr = avg != null ? `${Math.round(avg * 10) / 10}/${it.max_score}` : `not scored (max ${it.max_score})`
      lines.push(`- ${it.title} — ${scoreStr}`)
      const cmts = commentsByItem.get(it.id) ?? []
      for (const c of cmts) lines.push(`    comment: ${c}`)
    }
  }
  const finalComments = (finals ?? []).map((f) => f.comment).filter(Boolean)
  if (finalComments.length) {
    lines.push(`\n## Closing comments`)
    for (const c of finalComments) lines.push(`- ${c}`)
  }

  return { employeeName, jobTitle: emp?.job_title ?? null, period: review.period, breakdown: lines.join("\n") }
}

export type ActionPointsResult = GenerateResult | { ok: false; reason: "disabled" | "no_review" | "kept_hr_draft"; message: string }

/**
 * Ask OpenAI for a review's action points.
 *  - dryRun: return the text only (Settings → AI "Try it on a review").
 *  - otherwise: save it as an AI draft for HR to edit and approve. Staff never
 *    see a draft; approval copies it to kpi_reviews.action_points.
 * `onComplete` (the automatic run when HR marks a review Complete) skips when
 * the feature is off, or when HR has already approved or hand-edited this
 * review's action points (so it never overwrites HR's work). Never throws.
 */
export async function generateActionPoints(
  supabase: DB,
  reviewId: string,
  opts: { triggeredBy?: string | null; dryRun?: boolean; onComplete?: boolean; promptOverride?: string } = {}
): Promise<ActionPointsResult> {
  try {
    const settings = await loadAiSettings()
    if (opts.onComplete && !settings.actionPointsEnabled) {
      return { ok: false, reason: "disabled", message: "Automatic action points are turned off in Settings → AI." }
    }

    const admin = createAdminClient()
    if (opts.onComplete) {
      const [{ data: review }, { data: draft }] = await Promise.all([
        admin.from("kpi_reviews").select("action_points").eq("id", reviewId).maybeSingle(),
        admin.from("kpi_action_point_drafts").select("source").eq("review_id", reviewId).maybeSingle(),
      ])
      if (review?.action_points || draft?.source === "hr") {
        return { ok: false, reason: "kept_hr_draft", message: "Kept HR's action points." }
      }
    }

    const ctx = await buildContext(supabase, reviewId, settings.includeNames)
    if (!ctx) return { ok: false, reason: "no_review", message: "Review not found." }

    const who = settings.includeNames ? `Staff member: ${ctx.employeeName}` : "Staff member: (name withheld)"
    const input = `${who}${ctx.jobTitle ? `\nRole: ${ctx.jobTitle}` : ""}\nReview period: ${ctx.period}\n\nKPI results and comments:\n${ctx.breakdown}\n\nWrite the action points this person should focus on next quarter.`

    const result = await generateText({
      feature: opts.dryRun ? "action_points_preview" : "action_points",
      instructions: (opts.promptOverride ?? settings.actionPointsPrompt ?? DEFAULT_ACTION_POINTS_PROMPT).trim(),
      input,
      reviewId,
      triggeredBy: opts.triggeredBy,
      settings,
    })
    if (!result.ok || opts.dryRun) return result

    const { error } = await admin.from("kpi_action_point_drafts").upsert({
      review_id: reviewId,
      content: result.text,
      source: "ai",
      model: result.model,
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: opts.triggeredBy ?? null,
    })
    if (error) {
      console.error("[generateActionPoints] store draft", error)
      return { ok: false, reason: "no_review", message: "Couldn't save the draft." }
    }
    return result
  } catch (e) {
    console.error("[generateActionPoints]", e)
    return { ok: false, reason: "no_review", message: "Something went wrong generating action points." }
  }
}
