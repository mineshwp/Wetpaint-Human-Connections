import { NextResponse } from "next/server"
import { requireHR } from "@/lib/hr-api"
import { loadDepartmentsData } from "@/lib/departments"

// Settings → Departments (HR only): departments with staff counts and managers,
// plus current staff for the manager picker.
export async function GET() {
  const ctx = await requireHR()
  if (ctx.error) return ctx.error
  return NextResponse.json(await loadDepartmentsData())
}
