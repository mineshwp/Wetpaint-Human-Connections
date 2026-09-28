import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole, getEmployeeIdForUser } from "@/lib/auth"
import { blockWhileImpersonating } from "@/lib/impersonation"

type Supa = Awaited<ReturnType<typeof createClient>>

/**
 * For HR-only API routes: signed in, HR role, and (for writes) not in a
 * "view as" session. Returns an error response to send, or the context.
 */
export async function requireHR(opts: { write?: boolean } = {}): Promise<
  { error: NextResponse } | { error?: undefined; supabase: Supa; userId: string; employeeId: string | null }
> {
  if (opts.write) {
    const viewOnly = await blockWhileImpersonating()
    if (viewOnly) return { error: viewOnly }
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  return { supabase, userId: user.id, employeeId: await getEmployeeIdForUser(supabase, user.id) }
}
