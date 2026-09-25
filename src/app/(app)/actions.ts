"use server"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getRealUserRole } from "@/lib/auth"
import { startViewAs, clearViewAs } from "@/lib/impersonation"

export async function signOut() {
  await clearViewAs()
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}

// "View as" button on an employee's profile.
export async function setImpersonation(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const role = await getRealUserRole(supabase, user.id)
  if (role !== "hr") return

  const employeeId = formData.get("employeeId") as string
  if (!employeeId) return

  const result = await startViewAs(supabase, user.id, employeeId)
  if (!result.ok) return

  // Land where they land after logging in.
  redirect("/employees")
}

export async function clearImpersonation() {
  await clearViewAs()
  redirect("/employees")
}
