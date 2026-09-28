import { NextResponse } from "next/server"
import { requireHR } from "@/lib/hr-api"
import { getApiKey, listModels } from "@/lib/ai/openai"

// Test the current key (HR only): returns the models it can use. No cost.
export async function POST() {
  const ctx = await requireHR()
  if (ctx.error) return ctx.error
  const key = await getApiKey()
  if (!key) return NextResponse.json({ error: "No API key is set yet" }, { status: 400 })
  const r = await listModels(key.key)
  if (!r.ok) return NextResponse.json({ error: r.message }, { status: 400 })
  return NextResponse.json({ ok: true, source: key.source, models: r.models })
}
