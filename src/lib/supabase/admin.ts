import { createClient } from "@supabase/supabase-js"

// Server-side only — uses the service role key. Never import this in client components.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    // Surface a clear, catchable error instead of supabase-js's opaque
    // "supabaseKey is required" — almost always a missing Vercel env var.
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured on the server. " +
        "Add it to the Vercel project environment variables and redeploy."
    )
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
