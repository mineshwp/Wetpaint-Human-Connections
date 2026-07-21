import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"

// Merge/update import of a KPI template (sections + items) from CSV or XLSX.
// Matches by section title, then by item title within the section: existing
// rows are updated, new ones created. Anything not in the file is left alone.

type RawRow = Record<string, unknown>

function pick(row: Record<string, unknown>, key: string): string {
  const v = row[key]
  return v === undefined || v === null ? "" : String(v).trim()
}

function toInt(value: string, fallback: number): number {
  const n = Number(value)
  return value !== "" && Number.isFinite(n) ? Math.round(n) : fallback
}

function normalizeType(value: string): "hr" | "invitee" {
  const v = value.toLowerCase()
  if (v === "hr" || v === "admin") return "hr"
  return "invitee" // peers / peer / invitee / anything else
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const form = await req.formData()
  const file = form.get("file")
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
  }

  // xlsx reads both CSV and XLSX from the same buffer.
  const XLSX = await import("xlsx")
  let rawRows: RawRow[]
  try {
    const buf = new Uint8Array(await file.arrayBuffer())
    const wb = XLSX.read(buf, { type: "array" })
    const ws = wb.Sheets[wb.SheetNames[0]]
    if (!ws) return NextResponse.json({ error: "The file has no readable sheet" }, { status: 400 })
    rawRows = XLSX.utils.sheet_to_json<RawRow>(ws, { defval: "" })
  } catch (e) {
    console.error("[POST /api/kpi/template/import] parse", e)
    return NextResponse.json({ error: "Could not parse the file. Use the exported CSV/XLSX layout." }, { status: 400 })
  }

  // Normalize header keys to lowercase snake so minor header variations still map.
  const rows = rawRows.map((r) => {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(r)) {
      out[k.toLowerCase().trim().replace(/\s+/g, "_")] = v
    }
    return out
  })

  // Group rows by section (case-insensitive title), preserving file order.
  interface Group {
    title: string
    type: "hr" | "invitee"
    position: string
    items: { title: string; description: string; min: number; max: number; position: string }[]
  }
  const groups: Group[] = []
  const groupByKey = new Map<string, Group>()

  for (const row of rows) {
    const sectionTitle = pick(row, "section_title")
    if (!sectionTitle) continue // rows without a section are ignored

    const key = sectionTitle.toLowerCase()
    let group = groupByKey.get(key)
    if (!group) {
      group = {
        title: sectionTitle,
        type: normalizeType(pick(row, "section_type")),
        position: pick(row, "section_position"),
        items: [],
      }
      groupByKey.set(key, group)
      groups.push(group)
    }
    // A later row can still carry section metadata — fill if missing.
    if (pick(row, "section_position") && !group.position) group.position = pick(row, "section_position")

    const itemTitle = pick(row, "item_title")
    if (itemTitle) {
      group.items.push({
        title: itemTitle,
        description: pick(row, "item_description"),
        min: toInt(pick(row, "min_score"), 0),
        max: toInt(pick(row, "max_score"), 10),
        position: pick(row, "item_position"),
      })
    }
  }

  if (groups.length === 0) {
    return NextResponse.json({ error: "No sections found. Ensure a 'section_title' column with values." }, { status: 400 })
  }

  // Existing active sections for matching.
  const { data: existingSections } = await supabase
    .from("kpi_template_sections")
    .select("id, title, position")
    .eq("is_active", true)

  const sectionByTitle = new Map<string, { id: string; position: number }>()
  let maxSectionPos = -1
  for (const s of existingSections ?? []) {
    sectionByTitle.set((s.title ?? "").toLowerCase(), { id: s.id, position: s.position ?? 0 })
    if ((s.position ?? 0) > maxSectionPos) maxSectionPos = s.position ?? 0
  }

  let sectionsCreated = 0, sectionsUpdated = 0, itemsCreated = 0, itemsUpdated = 0
  const errors: string[] = []

  for (const group of groups) {
    const key = group.title.toLowerCase()
    const wantPos = group.position !== "" ? toInt(group.position, maxSectionPos + 1) : null

    let sectionId: string
    const existing = sectionByTitle.get(key)
    if (existing) {
      sectionId = existing.id
      const update: Record<string, unknown> = { type: group.type }
      if (wantPos !== null) update.position = wantPos
      const { error } = await supabase.from("kpi_template_sections").update(update).eq("id", sectionId)
      if (error) { errors.push(`Section "${group.title}": ${error.message}`); continue }
      sectionsUpdated++
    } else {
      const position = wantPos !== null ? wantPos : ++maxSectionPos
      const { data: created, error } = await supabase
        .from("kpi_template_sections")
        .insert({ title: group.title, type: group.type, position, is_active: true })
        .select("id")
        .single()
      if (error || !created) { errors.push(`Section "${group.title}": ${error?.message ?? "insert failed"}`); continue }
      sectionId = created.id
      sectionByTitle.set(key, { id: sectionId, position })
      if (position > maxSectionPos) maxSectionPos = position
      sectionsCreated++
    }

    // Existing active items in this section for matching.
    const { data: existingItems } = await supabase
      .from("kpi_template_items")
      .select("id, title, position")
      .eq("section_id", sectionId)
      .eq("is_active", true)

    const itemByTitle = new Map<string, string>()
    let maxItemPos = -1
    for (const it of existingItems ?? []) {
      itemByTitle.set((it.title ?? "").toLowerCase(), it.id)
      if ((it.position ?? 0) > maxItemPos) maxItemPos = it.position ?? 0
    }

    for (let i = 0; i < group.items.length; i++) {
      const item = group.items[i]
      const itemKey = item.title.toLowerCase()
      const wantItemPos = item.position !== "" ? toInt(item.position, i + 1) : null
      const existingItemId = itemByTitle.get(itemKey)

      if (existingItemId) {
        const update: Record<string, unknown> = {
          description: item.description || null,
          min_score: item.min,
          max_score: item.max,
        }
        if (wantItemPos !== null) update.position = wantItemPos
        const { error } = await supabase.from("kpi_template_items").update(update).eq("id", existingItemId)
        if (error) { errors.push(`Item "${item.title}": ${error.message}`); continue }
        itemsUpdated++
      } else {
        const position = wantItemPos !== null ? wantItemPos : ++maxItemPos
        const { error } = await supabase.from("kpi_template_items").insert({
          section_id: sectionId,
          title: item.title,
          description: item.description || null,
          min_score: item.min,
          max_score: item.max,
          position,
          is_active: true,
        })
        if (error) { errors.push(`Item "${item.title}": ${error.message}`); continue }
        itemByTitle.set(itemKey, "created")
        if (position > maxItemPos) maxItemPos = position
        itemsCreated++
      }
    }
  }

  return NextResponse.json({
    message: `Imported: ${sectionsCreated} section(s) created, ${sectionsUpdated} updated · ${itemsCreated} item(s) created, ${itemsUpdated} updated${errors.length ? ` · ${errors.length} error(s)` : ""}`,
    sectionsCreated, sectionsUpdated, itemsCreated, itemsUpdated,
    errors,
  })
}
