import { createClient } from "@/lib/supabase/server"

type DB = Awaited<ReturnType<typeof createClient>>

interface Item { id: string; title: string; description: string | null; max_score: number; review_id: string | null; is_active: boolean }
interface Section { title: string; type: string; kpi_template_items: Item[] }

// Build a compact, readable breakdown of a review's KPIs, scores and comments
// to feed the model.
async function buildContext(supabase: DB, reviewId: string): Promise<{ employeeName: string; period: string; breakdown: string } | null> {
  const { data: review } = await supabase
    .from("kpi_reviews")
    .select("period, employee:employees!kpi_reviews_employee_id_fkey(first_name, last_name, job_title)")
    .eq("id", reviewId)
    .maybeSingle()
  if (!review) return null

  const emp = review.employee as unknown as { first_name: string; last_name: string; job_title: string | null } | null
  const employeeName = emp ? `${emp.first_name} ${emp.last_name}` : "the staff member"

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

  return { employeeName, period: review.period, breakdown: lines.join("\n") }
}

// Generate action points for a review via OpenAI and store them. Dormant until
// OPENAI_API_KEY is set — returns { generated: false } and does nothing then.
// Best-effort: never throws.
export async function generateActionPoints(supabase: DB, reviewId: string): Promise<{ generated: boolean; reason?: string }> {
  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return { generated: false, reason: "no_api_key" }

    const ctx = await buildContext(supabase, reviewId)
    if (!ctx) return { generated: false, reason: "no_review" }

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini"
    const system = "You are an HR performance coach. Given a staff member's KPI scores and reviewer comments for a quarter, write concise, specific, actionable improvement points for the NEXT quarter. Focus on the lowest-scoring areas and any concerns raised in comments. Return 3–6 bullet points, each a short imperative sentence. Output plain text bullets starting with '- ', no preamble, no headings."
    const userMsg = `Staff member: ${ctx.employeeName}\nReview period: ${ctx.period}\n\nKPI results and comments:\n${ctx.breakdown}\n\nWrite the action points this person should focus on to improve next quarter.`

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, { role: "user", content: userMsg }],
        temperature: 0.3,
        max_tokens: 500,
      }),
    })

    if (!res.ok) {
      console.error("[generateActionPoints] OpenAI error", res.status, await res.text().catch(() => ""))
      return { generated: false, reason: `openai_${res.status}` }
    }

    const json = await res.json()
    const content: string = json?.choices?.[0]?.message?.content?.trim() ?? ""
    if (!content) return { generated: false, reason: "empty" }

    const { error } = await supabase
      .from("kpi_reviews")
      .update({ action_points: content, action_points_generated_at: new Date().toISOString() })
      .eq("id", reviewId)
    if (error) {
      console.error("[generateActionPoints] store error", error)
      return { generated: false, reason: "store_failed" }
    }

    return { generated: true }
  } catch (e) {
    console.error("[generateActionPoints]", e)
    return { generated: false, reason: "exception" }
  }
}
