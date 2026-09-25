import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"
import { syncCustomItemToSiblings, syncOverrideToSiblings } from "@/lib/kpi/inherit"
import { blockWhileImpersonating } from "@/lib/impersonation"

// Resolve whether an item is global (review_id null) or this review's custom item.
async function loadItem(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemId: string
) {
  const { data } = await supabase
    .from("kpi_template_items")
    .select("id, review_id, section_id, title")
    .eq("id", itemId)
    .single()
  return data
}

// Edit a KPI for THIS review only.
//  - global item  → store/merge a per-review override (leaves the global row intact)
//  - custom item  → edit the item directly (it already belongs to this review)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const viewOnly = await blockWhileImpersonating()
  if (viewOnly) return viewOnly
  const { id: reviewId, itemId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const fields: Record<string, unknown> = {}
  if (typeof body.title === "string") fields.title = body.title.trim()
  if (body.description !== undefined) fields.description = body.description || null
  if (body.min_score !== undefined) fields.min_score = body.min_score
  if (body.max_score !== undefined) fields.max_score = body.max_score

  const item = await loadItem(supabase, itemId)
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 })

  if (item.review_id === reviewId) {
    // Custom item — edit directly, then push the same edit to this employee's
    // matching custom item (same section + original title) in their other
    // reviews for the same year, so individualized criteria stay in sync.
    const { error } = await supabase.from("kpi_template_items").update(fields).eq("id", itemId)
    if (error) return NextResponse.json({ error: "Failed to update KPI" }, { status: 500 })

    const { data: review } = await supabase
      .from("kpi_reviews")
      .select("employee_id, period")
      .eq("id", reviewId)
      .maybeSingle()
    if (review) {
      await syncCustomItemToSiblings(
        supabase,
        { id: reviewId, employee_id: review.employee_id, period: review.period },
        item.section_id,
        item.title,
        fields,
      )
    }

    return NextResponse.json({ success: true, scope: "custom" })
  }

  if (item.review_id === null) {
    // Global item — store an override for this review (do not touch `hidden`),
    // then push the same override onto the matching global item in this
    // employee's other reviews for the same year.
    const { error } = await supabase
      .from("kpi_review_item_overrides")
      .upsert({ review_id: reviewId, item_id: itemId, ...fields }, { onConflict: "review_id,item_id" })
    if (error) return NextResponse.json({ error: "Failed to save override" }, { status: 500 })

    const { data: review } = await supabase
      .from("kpi_reviews")
      .select("employee_id, period")
      .eq("id", reviewId)
      .maybeSingle()
    if (review) {
      await syncOverrideToSiblings(
        supabase,
        { id: reviewId, employee_id: review.employee_id, period: review.period },
        itemId,
        async (targetReviewId, targetItemId) => {
          await supabase
            .from("kpi_review_item_overrides")
            .upsert({ review_id: targetReviewId, item_id: targetItemId, ...fields }, { onConflict: "review_id,item_id" })
        },
      )
    }

    return NextResponse.json({ success: true, scope: "override" })
  }

  return NextResponse.json({ error: "Item belongs to another review" }, { status: 400 })
}

// action=remove (default): hide this KPI for this review only
//   global item → override.hidden = true ; custom item → soft-delete
// action=reset: revert this KPI to the global template
//   global item → delete the override ; custom item → soft-delete (it has no global default)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const viewOnly = await blockWhileImpersonating()
  if (viewOnly) return viewOnly
  const { id: reviewId, itemId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const action = new URL(req.url).searchParams.get("action") === "reset" ? "reset" : "remove"

  const item = await loadItem(supabase, itemId)
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 })

  // Custom item: both remove and reset simply take it out of this review —
  // and out of its matching copies in the employee's other same-year reviews.
  if (item.review_id === reviewId) {
    const { error } = await supabase.from("kpi_template_items").update({ is_active: false }).eq("id", itemId)
    if (error) return NextResponse.json({ error: "Failed to remove KPI" }, { status: 500 })

    const { data: review } = await supabase
      .from("kpi_reviews")
      .select("employee_id, period")
      .eq("id", reviewId)
      .maybeSingle()
    if (review) {
      await syncCustomItemToSiblings(
        supabase,
        { id: reviewId, employee_id: review.employee_id, period: review.period },
        item.section_id,
        item.title,
        { is_active: false },
      )
    }

    return NextResponse.json({ success: true })
  }

  if (item.review_id === null) {
    const { data: review } = await supabase
      .from("kpi_reviews")
      .select("employee_id, period")
      .eq("id", reviewId)
      .maybeSingle()

    if (action === "reset") {
      const { error } = await supabase
        .from("kpi_review_item_overrides")
        .delete()
        .eq("review_id", reviewId)
        .eq("item_id", itemId)
      if (error) return NextResponse.json({ error: "Failed to reset KPI" }, { status: 500 })

      if (review) {
        await syncOverrideToSiblings(
          supabase,
          { id: reviewId, employee_id: review.employee_id, period: review.period },
          itemId,
          async (targetReviewId, targetItemId) => {
            await supabase
              .from("kpi_review_item_overrides")
              .delete()
              .eq("review_id", targetReviewId)
              .eq("item_id", targetItemId)
          },
        )
      }

      return NextResponse.json({ success: true })
    }
    // remove → hide for this review, and for the matching item in this
    // employee's other same-year reviews.
    const { error } = await supabase
      .from("kpi_review_item_overrides")
      .upsert({ review_id: reviewId, item_id: itemId, hidden: true }, { onConflict: "review_id,item_id" })
    if (error) return NextResponse.json({ error: "Failed to remove KPI" }, { status: 500 })

    if (review) {
      await syncOverrideToSiblings(
        supabase,
        { id: reviewId, employee_id: review.employee_id, period: review.period },
        itemId,
        async (targetReviewId, targetItemId) => {
          await supabase
            .from("kpi_review_item_overrides")
            .upsert({ review_id: targetReviewId, item_id: targetItemId, hidden: true }, { onConflict: "review_id,item_id" })
        },
      )
    }

    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: "Item belongs to another review" }, { status: 400 })
}
