import { cookies } from "next/headers"

export interface ImpersonationContext {
  employeeId: string
  employeeName: string
}

export async function getImpersonationContext(): Promise<ImpersonationContext | null> {
  const cookieStore = await cookies()
  const id = cookieStore.get("impersonate_employee_id")?.value
  const name = cookieStore.get("impersonate_employee_name")?.value
  if (!id || !name) return null
  return { employeeId: id, employeeName: name }
}
