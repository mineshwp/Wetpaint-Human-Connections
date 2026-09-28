import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireHR } from "@/lib/hr-api"
import { listModels } from "@/lib/ai/openai"

// Save or remove the OpenAI API key (HR only). The key is checked with OpenAI
// first, then stored encrypted in Supabase Vault. It is never sent back.

export async function POST(req: NextRequest) {
  const ctx = await requireHR({ write: true })
  if (ctx.error) return ctx.error
  const body = await req.json().catch(() => null)
  const key = typeof body?.key === "string" ? body.key.trim() : ""
  if (!/^sk-[A-Za-z0-9_\-]{20,}$/.test(key)) {
    return NextResponse.json({ error: "That doesn't look like an OpenAI API key (it should start with sk-)" }, { status: 400 })
  }

  const check = await listModels(key)
  if (!check.ok) return NextResponse.json({ error: check.message }, { status: 400 })

  const { error } = await createAdminClient().rpc("hc_ai_set_key", {
    p_key: key, p_last4: key.slice(-4), p_by: ctx.employeeId,
  })
  if (error) {
    console.error("[POST /api/settings/ai/key]", error)
    return NextResponse.json({ error: "Failed to save the key" }, { status: 500 })
  }
  return NextResponse.json({ success: true, last4: key.slice(-4), models: check.models })
}

export async function DELETE() {
  const ctx = await requireHR({ write: true })
  if (ctx.error) return ctx.error
  const { error } = await createAdminClient().rpc("hc_ai_clear_key")
  if (error) {
    console.error("[DELETE /api/settings/ai/key]", error)
    return NextResponse.json({ error: "Failed to remove the key" }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
