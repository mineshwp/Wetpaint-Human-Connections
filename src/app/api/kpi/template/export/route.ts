import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"

// Column order for the round-trip template file.
const HEADERS = [
  "section_title",
  "section_type",
  "section_position",
  "item_title",
  "item_description",
  "min_score",
  "max_score",
  "item_position",
] as const

type Row = Record<(typeof HEADERS)[number], string | number>

function csvEscape(value: string | number): string {
  const s = String(value ?? "")
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

// Export the active KPI template (sections + items) as CSV or XLSX (HR only).
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const format = new URL(req.url).searchParams.get("format") === "xlsx" ? "xlsx" : "csv"

  const { data, error } = await supabase
    .from("kpi_template_sections")
    .select("title, type, position, kpi_template_items(title, description, min_score, max_score, position, is_active)")
    .eq("is_active", true)
    .order("position")

  if (error) {
    console.error("[GET /api/kpi/template/export]", error)
    return NextResponse.json({ error: "Failed to load template" }, { status: 500 })
  }

  const rows: Row[] = []
  for (const section of data ?? []) {
    const sectionType = section.type === "hr" ? "hr" : "peers"
    const items = (section.kpi_template_items ?? [])
      .filter((i: { is_active: boolean }) => i.is_active)
      .sort((a: { position: number }, b: { position: number }) => a.position - b.position)

    if (items.length === 0) {
      // Emit a section-only row so empty sections still round-trip.
      rows.push({
        section_title: section.title ?? "",
        section_type: sectionType,
        section_position: section.position ?? "",
        item_title: "",
        item_description: "",
        min_score: "",
        max_score: "",
        item_position: "",
      })
      continue
    }

    for (const item of items) {
      rows.push({
        section_title: section.title ?? "",
        section_type: sectionType,
        section_position: section.position ?? "",
        item_title: item.title ?? "",
        item_description: item.description ?? "",
        min_score: item.min_score ?? 0,
        max_score: item.max_score ?? 10,
        item_position: item.position ?? "",
      })
    }
  }

  const filename = `kpi-template.${format}`

  if (format === "xlsx") {
    const XLSX = await import("xlsx")
    const ws = XLSX.utils.json_to_sheet(rows, { header: [...HEADERS] })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "KPI Template")
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
    ...rows.map((r) => HEADERS.map((h) => csvEscape(r[h])).join(",")),
  ]
  const csv = lines.join("\r\n")
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
