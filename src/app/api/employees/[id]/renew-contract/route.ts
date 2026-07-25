import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"

// Add N whole months to a YYYY-MM-DD date, clamping the day to the target
// month's length (e.g. 31 Jan + 1 month → 28/29 Feb).
function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number)
  const base = new Date(Date.UTC(y, m - 1, d))
  const targetMonth = base.getUTCMonth() + months
  const targetYear = base.getUTCFullYear() + Math.floor(targetMonth / 12)
  const normMonth = ((targetMonth % 12) + 12) % 12
  const lastDay = new Date(Date.UTC(targetYear, normMonth + 1, 0)).getUTCDate()
  const day = Math.min(d, lastDay)
  const dt = new Date(Date.UTC(targetYear, normMonth, day))
  return dt.toISOString().slice(0, 10)
}

// Renew a fixed-term contract: extend the end date by the contract's term.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data: emp, error: fetchErr } = await supabase
    .from("employees")
    .select("contract_end_date, contract_term_months, contract_is_renewable")
    .eq("id", id)
    .single()
  if (fetchErr || !emp) return NextResponse.json({ error: "Employee not found" }, { status: 404 })

  const term = emp.contract_term_months
  if (!term || term <= 0) {
    return NextResponse.json({ error: "Set a contract term (months) before renewing." }, { status: 400 })
  }

  // Extend from the current end date so terms stay contiguous; if none is set
  // yet, start from today.
  const base = emp.contract_end_date ?? new Date().toISOString().slice(0, 10)
  const newEnd = addMonths(base, term)

  const { error: updErr } = await supabase
    .from("employees")
    .update({ contract_end_date: newEnd, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (updErr) {
    console.error("[POST /api/employees/[id]/renew-contract]", updErr)
    return NextResponse.json({ error: "Failed to renew contract" }, { status: 500 })
  }

  return NextResponse.json({ contractEndDate: newEnd })
}
