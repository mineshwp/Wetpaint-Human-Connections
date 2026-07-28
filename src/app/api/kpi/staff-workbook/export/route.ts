import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"

// Exports a workbook with ONE worksheet per active staff member. Each sheet is
// pre-filled with the active global KPI template (section + item rows) and empty
// Q1–Q4 score columns for HR to fill in offline. XLSX only (tabs need a workbook).

interface RawItem {
  id: string
  title: string
  description: string | null
  max_score: number | null
  position: number
  is_active: boolean
  review_id: string | null
}
interface RawSection {
  id: string
  title: string | null
  type: string
  position: number
  is_active: boolean
  kpi_template_items: RawItem[]
}
interface Emp {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  job_title: string | null
  department: { name: string | null } | { name: string | null }[] | null
}

// Excel sheet names: max 31 chars, and none of : \ / ? * [ ]
function safeSheetName(raw: string, used: Set<string>): string {
  let base = (raw || "Staff").replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "Staff"
  let name = base
  let n = 2
  while (used.has(name.toLowerCase())) {
    const suffix = ` (${n})`
    base = (raw || "Staff").replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31 - suffix.length)
    name = base + suffix
    n++
  }
  used.add(name.toLowerCase())
  return name
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  // Active staff — one tab each, ordered like the KPI list.
  const { data: employees, error: empErr } = await supabase
    .from("employees")
    .select("id, first_name, last_name, email, job_title, department:departments(name)")
    .eq("status", "active")
    .order("last_name")
  if (empErr) {
    console.error("[GET /api/kpi/staff-workbook/export] employees", empErr)
    return NextResponse.json({ error: "Failed to load employees" }, { status: 500 })
  }
  if (!employees || employees.length === 0) {
    return NextResponse.json({ error: "No active staff to export" }, { status: 404 })
  }

  // Active global template (sections + items). Custom per-review items are
  // excluded — this is the shared template every staff member starts from.
  const { data: sections, error: secErr } = await supabase
    .from("kpi_template_sections")
    .select("id, title, type, position, is_active, kpi_template_items(id, title, description, max_score, position, is_active, review_id)")
    .eq("is_active", true)
    .order("position")
  if (secErr) {
    console.error("[GET /api/kpi/staff-workbook/export] sections", secErr)
    return NextResponse.json({ error: "Failed to load template" }, { status: 500 })
  }

  // Flatten template into ordered (section, item) rows once — reused per sheet.
  const templateRows: { section: string; item: string; description: string; max: number }[] = []
  for (const s of ((sections ?? []) as RawSection[]).sort((a, b) => a.position - b.position)) {
    const items = (s.kpi_template_items ?? [])
      .filter((i) => i.is_active && i.review_id === null)
      .sort((a, b) => a.position - b.position)
    for (const i of items) {
      templateRows.push({
        section: s.title ?? "",
        item: i.title ?? "",
        description: i.description ?? "",
        max: i.max_score ?? 10,
      })
    }
  }

  const XLSX = await import("xlsx")
  const wb = XLSX.utils.book_new()
  const usedNames = new Set<string>()

  const HEADER = ["Section", "KPI Item", "Description", "Max Score", "Q1", "Q2", "Q3", "Q4"]

  for (const e of employees as Emp[]) {
    const dept = Array.isArray(e.department) ? e.department[0] : e.department
    const name = `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || "Staff"
    const subtitle = [e.job_title ?? "", dept?.name ?? ""].filter(Boolean).join(" · ")

    const aoa: (string | number)[][] = [
      [name],
      [subtitle],
      [e.email ?? ""],
      [],
      HEADER,
      ...templateRows.map((r) => [r.section, r.item, r.description, r.max, "", "", "", ""]),
    ]

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws["!cols"] = [
      { wch: 28 }, // Section
      { wch: 40 }, // KPI Item
      { wch: 50 }, // Description
      { wch: 10 }, // Max
      { wch: 8 },  // Q1
      { wch: 8 },  // Q2
      { wch: 8 },  // Q3
      { wch: 8 },  // Q4
    ]
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(name, usedNames))
  }

  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="kpi-staff-workbook.xlsx"`,
    },
  })
}
