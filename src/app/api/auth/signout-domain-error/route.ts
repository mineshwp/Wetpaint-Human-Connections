import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  await supabase.auth.signOut()

  const url = request.nextUrl.clone()
  url.pathname = "/login"
  url.searchParams.set("error", "unauthorized_domain")
  return NextResponse.redirect(url)
}
