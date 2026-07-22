import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"
import { sendKpiScoringInviteEmail } from "@/lib/email"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: reviewId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const inviteeIds: string[] = body.invitee_ids ?? []
  const sendEmail: boolean = body.send_email === true
  if (!inviteeIds.length) return NextResponse.json({ error: "invitee_ids required" }, { status: 400 })

  // Emailing = a live invitation they must accept → "pending".
  // Silent add (backdated data entry) → "completed" so HR can immediately
  // record the reviewer's scores against them.
  const status = sendEmail ? "pending" : "completed"
  const rows = inviteeIds.map((invitee_id) => ({ review_id: reviewId, invitee_id, status }))
  const { data, error } = await supabase
    .from("kpi_review_invitees")
    .upsert(rows, { onConflict: "review_id,invitee_id", ignoreDuplicates: true })
    .select()

  if (error) return NextResponse.json({ error: "Failed to add invitees" }, { status: 500 })

  // Optionally email the invitees to prompt scoring. Best-effort: email
  // failures never fail the request (the invitees are already saved).
  let emailed = 0
  if (sendEmail) {
    const { data: review } = await supabase
      .from("kpi_reviews")
      .select("period, employee:employees!kpi_reviews_employee_id_fkey(first_name, last_name)")
      .eq("id", reviewId)
      .single()

    const { data: invitees } = await supabase
      .from("employees")
      .select("id, first_name, last_name, email")
      .in("id", inviteeIds)

    const emp = review?.employee as { first_name?: string; last_name?: string } | { first_name?: string; last_name?: string }[] | null
    const empObj = Array.isArray(emp) ? emp[0] : emp
    const subjectName = `${empObj?.first_name ?? ""} ${empObj?.last_name ?? ""}`.trim() || "a colleague"
    const period = review?.period ?? "the current"
    const url = process.env.NEXT_PUBLIC_SITE_URL ?? "https://wetpaint-human-connections-two.vercel.app"

    for (const inv of invitees ?? []) {
      if (!inv.email) continue
      const ok = await sendKpiScoringInviteEmail({
        to: inv.email,
        inviteeName: inv.first_name ?? "there",
        subjectName,
        period,
        url: `${url}/kpi`,
      })
      if (ok) emailed++
    }
  }

  return NextResponse.json({ invitees: data, emailed }, { status: 201 })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: reviewId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const { invitee_id } = body
  if (!invitee_id) return NextResponse.json({ error: "invitee_id required" }, { status: 400 })

  const { error } = await supabase
    .from("kpi_review_invitees")
    .delete()
    .eq("review_id", reviewId)
    .eq("invitee_id", invitee_id)

  if (error) return NextResponse.json({ error: "Failed to remove invitee" }, { status: 500 })

  return NextResponse.json({ success: true })
}
