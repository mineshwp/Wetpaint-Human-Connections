import type { User } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

// Audit trail behind the HR "Logs" page. Everything here is best-effort: a
// logging failure must never break (or slow) the action being logged.

export interface AuditMeta {
  /** Section of the app that was changed, e.g. "Employee profile", "KPI · Scores". */
  section: string
  /** What happened. A string, or per-HTTP-method wording. */
  action: string | Partial<Record<"POST" | "PUT" | "PATCH" | "DELETE", string>>
  /** Whose record it was done on: the route's [id] is an employee / a KPI review / a KPI reviewer row. */
  target?: "employee" | "review" | "invitee"
  /** Record the NAMES of the JSON fields sent (never the values). */
  fields?: boolean
}

type Admin = ReturnType<typeof createAdminClient>

async function actorFor(admin: Admin, userId: string) {
  const { data: au } = await admin.from("app_users").select("employee_id").eq("id", userId).maybeSingle()
  if (!au?.employee_id) return { employeeId: null as string | null, name: null as string | null }
  const { data: e } = await admin.from("employees").select("first_name, last_name").eq("id", au.employee_id).maybeSingle()
  return { employeeId: au.employee_id as string, name: e ? `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() : null }
}

const fullName = (e?: { first_name?: string | null; last_name?: string | null } | null) =>
  e ? `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() : null

async function resolveTarget(admin: Admin, kind: AuditMeta["target"], id: string | undefined) {
  const none = { employeeId: null as string | null, name: null as string | null, detail: null as string | null }
  if (!kind || !id) return none
  if (kind === "employee") {
    const { data: e } = await admin.from("employees").select("first_name, last_name").eq("id", id).maybeSingle()
    return { employeeId: e ? id : null, name: fullName(e), detail: null }
  }
  let reviewId: string | undefined = id
  if (kind === "invitee") {
    const { data: inv } = await admin.from("kpi_review_invitees").select("review_id").eq("id", id).maybeSingle()
    reviewId = inv?.review_id
  }
  if (!reviewId) return none
  const { data: r } = await admin
    .from("kpi_reviews").select("period, employee_id, employee:employees!kpi_reviews_employee_id_fkey(first_name, last_name)")
    .eq("id", reviewId).maybeSingle()
  if (!r) return none
  const emp = r.employee as unknown as { first_name: string | null; last_name: string | null } | null
  return { employeeId: r.employee_id as string, name: fullName(emp), detail: r.period as string }
}

/**
 * Wrap a Route Handler so each successful (status < 400) call is written to the
 * activity log. The handler's behaviour and response are untouched.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withAudit<H extends (req: any, ctx: any) => Promise<Response | undefined>>(handler: H, meta: AuditMeta): H {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrapped = async (req: Request, ctx: any) => {
    let fields: string[] | undefined
    if (meta.fields) {
      try {
        const body = await req.clone().json()
        if (body && typeof body === "object" && !Array.isArray(body)) {
          fields = Object.keys(body).map((k) => k.replace(/_/g, " "))
        }
      } catch {}
    }

    const res = await handler(req, ctx)

    if (res && res.status < 400) {
      try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const admin = createAdminClient()
          const [actor, params] = await Promise.all([actorFor(admin, user.id), Promise.resolve(ctx?.params)])
          const target = await resolveTarget(admin, meta.target, (params as { id?: string } | undefined)?.id)
          const method = req.method as keyof Exclude<AuditMeta["action"], string>
          const action = typeof meta.action === "string" ? meta.action : meta.action[method] ?? method
          await admin.from("activity_log").insert({
            event: "change",
            user_id: user.id,
            actor_employee_id: actor.employeeId,
            actor_name: actor.name ?? user.email ?? null,
            section: meta.section,
            action,
            target_employee_id: target.employeeId,
            target_name: target.name,
            detail: target.detail,
            fields: fields?.length ? fields : null,
          })
        }
      } catch (err) {
        console.error("[activity-log] change not logged", err)
      }
    }
    return res
  }
  return wrapped as unknown as H
}

/**
 * Record a sign-in. Supabase stamps `last_sign_in_at` on every password login,
 * so (user, that timestamp) identifies one login and repeat calls are ignored.
 */
export async function logLoginIfNew(user: User, req: Request) {
  try {
    if (!user.last_sign_in_at) return
    const admin = createAdminClient()
    const actor = await actorFor(admin, user.id)
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
    await admin.from("activity_log").upsert(
      {
        event: "login",
        user_id: user.id,
        actor_employee_id: actor.employeeId,
        actor_name: actor.name ?? user.email ?? null,
        created_at: user.last_sign_in_at,
        signed_in_at: user.last_sign_in_at,
        ip,
        user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
      },
      { onConflict: "user_id,signed_in_at", ignoreDuplicates: true },
    )
  } catch (err) {
    console.error("[activity-log] login not logged", err)
  }
}
