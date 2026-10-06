import { NextResponse } from "next/server"

/** Sent by the browser on real user activity; the middleware refreshes the idle cookie. */
export async function POST() {
  return NextResponse.json({ ok: true })
}
