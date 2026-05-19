"use server"

import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}

export async function setImpersonation(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return

  const employeeId = formData.get("employeeId") as string
  const employeeName = formData.get("employeeName") as string
  if (!employeeId || !employeeName) return

  const cookieStore = await cookies()
  cookieStore.set("impersonate_employee_id", employeeId, { httpOnly: true, path: "/" })
  cookieStore.set("impersonate_employee_name", employeeName, { httpOnly: true, path: "/" })

  redirect(`/employees/${employeeId}`)
}

export async function clearImpersonation() {
  const cookieStore = await cookies()
  cookieStore.delete("impersonate_employee_id")
  cookieStore.delete("impersonate_employee_name")
  redirect("/employees")
}

