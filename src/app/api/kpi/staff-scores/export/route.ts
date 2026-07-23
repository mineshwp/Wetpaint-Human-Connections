import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"

// One row per score "cell": (review × KPI item × scorer). Final comments ride
// along as special rows (section_type = "final", blank item). The review_id and
// item_id key columns let re-import match reliably even if titles are renamed.
const HEADERS = [
  "review_id",
  "employee",
  "employee_email",
  "period",
  "review_title",
  "section",
  "section_type",
  "kpi_item",
  "item_id",
  "scorer",
  "scorer_email",
  "score",
  "comments",
] as const

type Row = Record<(typeof HEADERS)[number], string | number>

function csvEscape(value: string | number): string {
  const s = String(value ?? "")
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

interface RawItem {
  id: string
  section_id: string
  title: string
  position: number
  is_active: boolean
  review_id: string | null
}
interface Override {
  item_id: string
  hidden: boolean
  title: string | null
}

// Export staff KPI scores (+ reviewers + final comments) as CSV or XLSX.
// ?format=csv|xlsx  ?review_id=<uuid> (one review) — omit for all reviews.
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const url = new URL(req.url)
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv"
  const oneReviewId = url.searchParams.get("review_id")

  // 1. Reviews in scope (+ subject employee).
  let reviewQuery = supabase
    .from("kpi_reviews")
    .select("id, period, title, employee:employees!kpi_reviews_employee_id_fkey(id, first_name, last_name, email)")
    .order("created_at", { ascending: true })
  if (oneReviewId) reviewQuery = reviewQuery.eq("id", oneReviewId)
  const { data: reviews, error: revErr } = await reviewQuery
  if (revErr) {
    console.error("[GET /api/kpi/staff-scores/export] reviews", revErr)
    return NextResponse.json({ error: "Failed to load reviews" }, { status: 500 })
  }
  const reviewIds = (reviews ?? []).map((r) => r.id)
  if (reviewIds.length === 0) {
    return NextResponse.json({ error: "No reviews to export" }, { status: 404 })
  }

  // 2. Template (sections + global and custom items), overrides, invitees,
  //    scores, final comments — all scoped to the reviews in play.
  const [
    { data: sections },
    { data: overrides },
    { data: invitees },
    { data: scores },
    { data: finalComments },
  ] = await Promise.all([
    supabase
      .from("kpi_template_sections")
      .select("id, title, type, position, is_active, kpi_template_items(id, section_id, title, position, is_active, review_id)")
      .eq("is_active", true)
      .order("position"),
    supabase
      .from("kpi_review_item_overrides")
      .select("review_id, item_id, hidden, title")
      .in("review_id", reviewIds),
    supabase
      .from("kpi_review_invitees")
      .select("id, review_id, invitee_id, invitee:employees!kpi_review_invitees_invitee_id_fkey(id, first_name, last_name, email), kpi_review_invitee_sections(section_id)")
      .in("review_id", reviewIds),
    supabase
      .from("kpi_scores")
      .select("review_id, item_id, scorer_id, score, comments")
      .in("review_id", reviewIds),
    supabase
      .from("kpi_final_comments")
      .select("review_id, author_id, comment")
      .in("review_id", reviewIds),
  ])

  // Employee directory (for naming scorers/authors by id).
  const empIds = new Set<string>()
  for (const s of scores ?? []) if (s.scorer_id) empIds.add(s.scorer_id)
  for (const f of finalComments ?? []) if (f.author_id) empIds.add(f.author_id)
  const empById = new Map<string, { name: string; email: string }>()
  if (empIds.size) {
    const { data: emps } = await supabase
      .from("employees")
      .select("id, first_name, last_name, email")
      .in("id", Array.from(empIds))
    for (const e of emps ?? []) {
      empById.set(e.id, { name: `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim(), email: e.email ?? "" })
    }
  }

  // Index overrides by review+item so hidden items drop out per-review.
  const overrideKey = (reviewId: string, itemId: string) => `${reviewId}::${itemId}`
  const overrideMap = new Map<string, Override>()
  for (const o of (overrides ?? []) as (Override & { review_id: string })[]) {
    overrideMap.set(overrideKey(o.review_id, o.item_id), o)
  }

  // Section metadata + raw items keyed by section.
  interface SectionMeta { title: string; type: string; position: number; items: RawItem[] }
  const sectionMeta = new Map<string, SectionMeta>()
  for (const s of sections ?? []) {
    sectionMeta.set(s.id, {
      title: s.title ?? "",
      type: s.type === "hr" ? "hr" : "peers",
      position: s.position ?? 0,
      items: ((s.kpi_template_items ?? []) as RawItem[]).filter((i) => i.is_active),
    })
  }

  // Invitees grouped by review, with their assigned section ids.
  interface InviteeInfo { id: string; name: string; email: string; sectionIds: Set<string> }
  const inviteesByReview = new Map<string, InviteeInfo[]>()
  for (const inv of invitees ?? []) {
    const emp = Array.isArray(inv.invitee) ? inv.invitee[0] : inv.invitee
    const info: InviteeInfo = {
      id: inv.invitee_id,
      name: `${emp?.first_name ?? ""} ${emp?.last_name ?? ""}`.trim(),
      email: emp?.email ?? "",
      sectionIds: new Set((inv.kpi_review_invitee_sections ?? []).map((a: { section_id: string }) => a.section_id)),
    }
    const arr = inviteesByReview.get(inv.review_id) ?? []
    arr.push(info)
    inviteesByReview.set(inv.review_id, arr)
  }

  // Scores keyed by review::item::scorer (scorer "HR" for null).
  const scoreKey = (reviewId: string, itemId: string, scorer: string) => `${reviewId}::${itemId}::${scorer}`
  const scoreMap = new Map<string, { score: number | null; comments: string | null }>()
  const hrScoredItems = new Set<string>() // `${reviewId}::${itemId}`
  for (const s of scores ?? []) {
    const scorer = s.scorer_id ?? "HR"
    scoreMap.set(scoreKey(s.review_id, s.item_id, scorer), { score: s.score, comments: s.comments })
    if (!s.scorer_id) hrScoredItems.add(`${s.review_id}::${s.item_id}`)
  }

  const rows: (Row & { _s: number })[] = [] // _s = sort key
  let sortSeq = 0

  for (const review of reviews ?? []) {
    const emp = Array.isArray(review.employee) ? review.employee[0] : review.employee
    const empName = `${emp?.first_name ?? ""} ${emp?.last_name ?? ""}`.trim()
    const empEmail = emp?.email ?? ""
    const reviewInvitees = inviteesByReview.get(review.id) ?? []
    const emitted = new Set<string>() // dedupe item::scorer within this review

    const base = (): Omit<Row, "section" | "section_type" | "kpi_item" | "item_id" | "scorer" | "scorer_email" | "score" | "comments"> => ({
      review_id: review.id,
      employee: empName,
      employee_email: empEmail,
      period: review.period ?? "",
      review_title: review.title ?? "",
    })

    const pushRow = (
      sectionPos: number,
      itemPos: number,
      scorerRank: number,
      r: { section: string; section_type: string; kpi_item: string; item_id: string; scorer: string; scorer_email: string; score: number | null; comments: string | null }
    ) => {
      rows.push({
        ...base(),
        section: r.section,
        section_type: r.section_type,
        kpi_item: r.kpi_item,
        item_id: r.item_id,
        scorer: r.scorer,
        scorer_email: r.scorer_email,
        score: r.score ?? "",
        comments: r.comments ?? "",
        _s: sortSeq++, // stable within pre-sorted iteration
      })
      void sectionPos; void itemPos; void scorerRank
    }

    // Ordered sections then items.
    const orderedSections = Array.from(sectionMeta.entries())
      .map(([id, m]) => ({ id, ...m }))
      .sort((a, b) => a.position - b.position)

    for (const section of orderedSections) {
      const items = section.items
        .filter((i) => i.review_id === null || i.review_id === review.id)
        .filter((i) => {
          const ov = i.review_id === null ? overrideMap.get(overrideKey(review.id, i.id)) : undefined
          return !ov?.hidden
        })
        .sort((a, b) => a.position - b.position)

      const assignedInvitees = reviewInvitees.filter((inv) => inv.sectionIds.has(section.id))

      for (const item of items) {
        const ov = item.review_id === null ? overrideMap.get(overrideKey(review.id, item.id)) : undefined
        const title = ov?.title ?? item.title ?? ""

        // HR/Admin row: HR-type sections always, plus any peer item HR scored.
        if (section.type === "hr" || hrScoredItems.has(`${review.id}::${item.id}`)) {
          const k = `${item.id}::HR`
          if (!emitted.has(k)) {
            emitted.add(k)
            const cell = scoreMap.get(scoreKey(review.id, item.id, "HR"))
            pushRow(section.position, item.position, 0, {
              section: section.title, section_type: section.type, kpi_item: title, item_id: item.id,
              scorer: "HR/Admin", scorer_email: "", score: cell?.score ?? null, comments: cell?.comments ?? null,
            })
          }
        }

        // A row per reviewer assigned to this section (editable even if unscored).
        for (const inv of assignedInvitees) {
          const k = `${item.id}::${inv.id}`
          if (emitted.has(k)) continue
          emitted.add(k)
          const cell = scoreMap.get(scoreKey(review.id, item.id, inv.id))
          pushRow(section.position, item.position, 1, {
            section: section.title, section_type: section.type, kpi_item: title, item_id: item.id,
            scorer: inv.name || "Reviewer", scorer_email: inv.email, score: cell?.score ?? null, comments: cell?.comments ?? null,
          })
        }
      }
    }

    // Lossless pass: any existing score not already emitted (e.g. a reviewer
    // scored a section they're no longer assigned to).
    for (const s of scores ?? []) {
      if (s.review_id !== review.id) continue
      const scorer = s.scorer_id ?? "HR"
      const k = `${s.item_id}::${scorer}`
      if (emitted.has(k)) continue
      emitted.add(k)
      // Find the item's section for labelling.
      let sectionTitle = "", sectionType = "peers", itemTitle = ""
      for (const [sid, m] of sectionMeta) {
        const it = m.items.find((i) => i.id === s.item_id)
        if (it) {
          const ov = it.review_id === null ? overrideMap.get(overrideKey(review.id, it.id)) : undefined
          sectionTitle = m.title; sectionType = m.type; itemTitle = ov?.title ?? it.title ?? ""
          void sid
          break
        }
      }
      const who = s.scorer_id ? empById.get(s.scorer_id) : undefined
      pushRow(9998, 0, 2, {
        section: sectionTitle, section_type: sectionType, kpi_item: itemTitle, item_id: s.item_id,
        scorer: s.scorer_id ? (who?.name || "Reviewer") : "HR/Admin",
        scorer_email: who?.email ?? "", score: s.score, comments: s.comments,
      })
    }

    // Final comments (existing + one blank HR/Admin placeholder if none yet).
    const reviewFinals = (finalComments ?? []).filter((f) => f.review_id === review.id)
    let hasHRFinal = false
    for (const f of reviewFinals) {
      if (!f.author_id) hasHRFinal = true
      const who = f.author_id ? empById.get(f.author_id) : undefined
      pushRow(9999, 0, 0, {
        section: "Final Comments", section_type: "final", kpi_item: "", item_id: "",
        scorer: f.author_id ? (who?.name || "Reviewer") : "HR/Admin",
        scorer_email: who?.email ?? "", score: null, comments: f.comment ?? "",
      })
    }
    if (!hasHRFinal) {
      pushRow(9999, 0, 0, {
        section: "Final Comments", section_type: "final", kpi_item: "", item_id: "",
        scorer: "HR/Admin", scorer_email: "", score: null, comments: null,
      })
    }
  }

  const outRows: Row[] = rows.map(({ _s, ...r }) => { void _s; return r })
  const filename = oneReviewId ? `kpi-scores-review.${format}` : `kpi-scores-all.${format}`

  if (format === "xlsx") {
    const XLSX = await import("xlsx")
    const ws = XLSX.utils.json_to_sheet(outRows, { header: [...HEADERS] })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "KPI Scores")
    const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  }

  const lines = [
    HEADERS.join(","),
    ...outRows.map((r) => HEADERS.map((h) => csvEscape(r[h])).join(",")),
  ]
  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
