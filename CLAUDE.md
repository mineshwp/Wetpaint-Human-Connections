# CLAUDE.md
# wetpaint-human-connections — Live Production App

## Project Context

This is the **live production build** of the Wetpaint HR platform.
It is a clean Next.js scaffold being built incrementally, feature by feature.

**Scope right now: Employees + KPI only.**
Do not scaffold, reference, or build anything outside of this scope until explicitly instructed. Other modules (leave, recruitment, training, documents, payroll, etc.) will be added in future phases.

The reference implementation lives at:
`/Users/mineshsingh/Documents/Wetpaint/SAAS/WP Human Connections`

Use it to understand the intended UI patterns, component structure, and business logic — but do **not** copy it blindly. This is a production build: cleaner, leaner, and backed by real Supabase data.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| UI | React 19, shadcn/ui, Tailwind CSS v4 |
| Icons | lucide-react |
| Auth + DB | Supabase (@supabase/ssr + @supabase/supabase-js) |
| Package manager | npm |

**No mock data. No demo wrappers. No DemoShell. Everything reads from and writes to Supabase.**

---

## Authentication

- Supabase Auth with `@supabase/ssr` (already wired in `middleware.ts`)
- All internal users are **invite-only** — no self-registration
- Email format: `firstname@wetpaint.co.za`
- Login page is already built — do not touch it
- Middleware already protects all routes: unauthenticated users are redirected to `/login`
- After login, redirect to `/employees` (the default landing page for now)
- **Logins are HR-set temporary passwords, never emailed links** (Microsoft Safe
  Links auto-opens and burns one-time links). Staff/manager logins: Portal login
  card on the employee profile (`/api/employees/[id]/login`). HR admins: Settings.
  HR admins change their password via the user menu → `/login/reset-password`.
  **Forgot password:** `POST /api/auth/forgot-password` (public). HR admins get a
  reset link emailed; for anyone else the people in Settings → Notifications
  ("Password reset requests go to", `kpi_settings.password_reset_notify_emails`; empty = all
  HR admins; resolved by `resolveRecipients` in `src/lib/notification-settings.ts`) are emailed to set a temp password and send it to them. Same response either way (no account/admin discovery). One request
  per person per hour (`password_reset_requests`). Only HR admins can change their
  own password (menu item hidden + `/login/reset-password` redirects others).

**Idle logout:** 15 minutes of inactivity signs the user out (1-minute warning). Browser: `IdleLogout` in `AppShell`; server: `src/middleware.ts` checks the `hc_last_active` cookie (refreshed by page loads and `POST /api/auth/touch`, not by other API calls) and rejects stale sessions. Constants in `src/lib/idle.ts`.

### Database security (RLS)

- Every table has RLS; policies mirror the app rules via helpers `hc_is_hr()`,
  `hc_employee_id()`, `hc_can_see_employee()`, `hc_can_view_review()`,
  `hc_can_score()`, `hc_is_team_lead_of()` (see `supabase/migrations/`).
- Nothing is granted to `anon`. Column guards stop non-HR sessions changing
  roles or protected employee fields.
- Signed-in users may read only directory columns of `employees`. Full records
  (ID, DOB, banking, salary, personal, next of kin) are read with the service
  client (`createAdminClient`) **after** the app's access check, then masked by
  `mapEmployeeFull`. New employee columns are not readable by sessions until
  granted. (Pending: `20260926_06` re-applies this after deploy — see migrations.)
- **PostgREST gotcha:** a table whose composite primary key is two FKs is
  treated as a many-to-many junction and makes existing embeds ambiguous
  (PGRST201). Give link tables a surrogate `id` PK + a unique index.

---

## Role System

Roles are stored in Supabase (table: `user_roles` or a `roles` column on the user profile — confirm from DB before building).

| Role | Access |
|---|---|
| `hr_admin` | Full access |
| `manager` | Set per PERSON, not login: `employees.access_level` = `manager_reports` (direct reports) / `manager_line` (whole reporting line) / `manager_department` (whole department); `staff` = own data. Teams come from "Reports to" (`employees.manager_id`) / Department. HR edits both in Settings → Who can see what (works before a login exists). Sees team profiles (masked) and published KPI reviews |
| `staff` | Own data only |

Rules:
- Role must be checked server-side on every protected API route
- Never rely on client-side role checks alone
- A user can hold multiple roles — check for the active/highest role

---

## Route Structure (current scope)

```
/login                          → Login page (already built, do not modify)
/employees                      → Employee list (HR/Admin + Manager)
/employees/[id]                 → Employee detail view (HR/Admin + Manager)
/employees/[id]/edit            → Edit employee (HR/Admin only)
/kpi                            → Tabs: All Reviews (HR) · My KPI (own published reviews + quarter summary) · My Team (managers: published reviews of their team) · Reviews to Score (reviews you're invited to; shown only if any)
/kpi/report                     → Quarterly HR report (HR only, printable)
/employees/training             → Training tracker: expired / expiring / all (HR only)
/logs                           → Activity log: sign-ins + changes, filter by staff member/type/section/date (HR only)
```

All routes under `/employees` and `/kpi` require authentication (handled by middleware).

---

## Employees Module

### List page (`/employees`)

- Shows all employees
- Filterable by department and status
- Searchable by name, job title, email
- Grid and list view toggle
- Stats row: Total, Active, Onboarding, On Leave
- HR/Admin sees all employees; Manager sees their department only

### Employee status values

```typescript
type EmploymentStatus = "active" | "onboarding" | "on-leave" | "terminated" | "suspended"
```

### Detail page (`/employees/[id]`)

Tabs:
1. **Personal & Employment** — personal info, contact, next of kin, employment details
2. **Banking & Payroll** — HR/Admin only; bank details with sensitive field masking
3. **Leave** — leave balances per type (read-only here; leave management is a future module)
4. **Training** — training records (KPIs are not shown on profiles; they live on `/kpi`)
5. **Documents** — file list with HR visibility toggle (HR can hide docs from staff view)
6. **HR Notes** — HR/Admin only; private internal notes

### Access rules (enforce server-side)

| Data | HR/Admin | Manager | Staff |
|---|---|---|---|
| View employee list | ✅ All | ✅ Their team (per access level) | ❌ |
| View personal details | ✅ | ✅ incl. home address; no DOB/ID/race/disability/citizenship/VAT | Own only |
| View banking/payroll/salary | ✅ | ❌ | ❌ |
| View documents | ✅ | Own only | Own only |
| View HR notes | ✅ | ❌ | ❌ |
| Edit employee record | ✅ | Own profile only | Own profile only |

Managers see their **own** record exactly as staff do. Field masking lives in
`src/lib/employees.ts` (`mapEmployeeFull` + `employeeFieldAccess`). Team scope:
`getTeamScope` / `applyTeamScope` in `src/lib/auth.ts` (DB mirror:
`hc_can_see_employee`). Department heads were removed on 28 Sep 2026 in favour
of these access levels; Settings → "Who can see what" shows the result.

### API routes needed

```
GET    /api/employees                        → list employees (scoped by role)
GET    /api/employees/me                     → current user's employee record
GET    /api/employees/active                 → all active employees (HR only, used by KPI)
GET    /api/employees/[id]                   → full employee detail
PATCH  /api/employees/[id]                   → update employee (HR/Admin or own profile)
GET    /api/employees/[id]/leave             → leave balances for employee
GET    /api/employees/[id]/kpi-summary       → latest KPI score summary
GET    /api/employees/[id]/documents         → documents (access-controlled)
PATCH  /api/documents/[id]/visibility        → toggle hidden_from_employee (HR only)
POST   /api/employees/[id]/documents/upload-url → one-time signed upload URL (HR only); browser uploads straight to the private `employee-documents` bucket
POST   /api/employees/[id]/documents           → record an uploaded file (HR only; checks it exists in that employee's folder)
DELETE /api/documents/[id]                     → delete document + file (HR only)
GET    /api/documents/[id]/download            → access-checked redirect to a 60s signed URL (HR any; staff own non-hidden)
GET    /api/employees/[id]/notes             → HR notes (HR only)
POST   /api/employees/[id]/notes             → add HR note (HR only)
GET/POST/DELETE /api/employees/[id]/login        → portal login status / create or reset (temp password) / disable (HR only). Access is NOT set here
```

---

## KPI Module

### Data model (Supabase tables)

```
kpi_template_sections
  id, title, type ("hr" | "invitee"), position, is_active, period
  # period scopes a template to one review period, e.g. "Q2 2026".
  # Items inherit their period via section_id. Each period is its own template.

kpi_template_items
  id, section_id, title, description, min_score, max_score, position, is_active

kpi_reviews
  id, employee_id, period, title, deadline, status ("draft" | "active" | "completed"),
  action_points, action_points_generated_at, action_points_approved_at, action_points_approved_by
  # action_points = HR-APPROVED text only (what staff/managers see). On complete
  # the AI writes a draft to kpi_action_point_drafts (HR-only); HR edits and
  # approves it on the review. Never write AI output straight to action_points.

kpi_action_point_drafts
  review_id (PK), content, source ("ai" | "hr"), model, generated_at, updated_at, updated_by

ai_settings  (single row id=1, HR only)
  action_points_enabled, include_names (default false — no names sent to OpenAI),
  model (default gpt-6-luna), reasoning_effort, max_output_tokens,
  monthly_budget_usd (in-app spend cap), action_points_prompt (null = default in
  src/lib/ai/prompts.ts), key_secret_id / key_last4 (key itself in Supabase Vault,
  read only via service-role RPC hc_ai_get_key; OPENAI_API_KEY env is a fallback)

ai_runs  (HR read-only log of every AI call: feature, model, tokens, cost_usd, status)

kpi_review_invitees
  id, review_id, invitee_id, status ("pending" | "accepted" | "declined" | "completed")

kpi_scores
  id, review_id, item_id, scorer_id (null = HR scored), score, comments

kpi_settings
  key, value  (e.g. key="current_period", value="Q1 2026")

kpi_rating_scale
  score (1-10 PK), label, annual_increase, birthday_bonus
  # Global reference rubric (not per-period). % values stored as free text so
  # notes ("3.6% SA inflation rate") and blank bands are allowed. HR edits,
  # everyone views. Reference only — no scores are computed from it.
```

### API routes needed

```
GET    /api/kpi/template?period=Q2%202026          → one period's sections + items, plus { periods } list (defaults to current_period)
POST   /api/kpi/template/clone                      → copy a period's template structure into a new period (HR only)
GET    /api/kpi/reviews                            → all reviews (HR) or own assignments (staff/invitee)
POST   /api/kpi/reviews                            → create review (HR only)
GET    /api/kpi/reviews/[id]                       → single review with invitees
PATCH  /api/kpi/reviews/[id]                       → update status (HR only)
DELETE /api/kpi/reviews/[id]                       → delete review (HR only)
GET    /api/kpi/reviews/[id]/scores                → all scores for a review
PUT    /api/kpi/reviews/[id]/scores                → upsert a score entry
POST   /api/kpi/reviews/[id]/items/copy            → copy a staff member's custom KPIs (titles/descriptions only) from another of their reviews (HR only)
POST   /api/kpi/reviews/[id]/invitees              → add invitees (HR only)
DELETE /api/kpi/reviews/[id]/invitees              → remove invitee (HR only)
POST   /api/kpi/invitees/[id]/respond              → accept or decline invite
GET    /api/kpi/settings                           → fetch settings (e.g. current_period)
GET    /api/kpi/rating-scale                        → rating guide rows (any authenticated user)
PUT    /api/kpi/rating-scale                        → bulk-upsert rating guide rows (HR only)
POST   /api/kpi/template/sections/[id]             → add item to section (HR only)
GET/PUT/POST/DELETE /api/kpi/reviews/[id]/action-points → draft+approved state / save or approve / AI regenerate / hide from staff (HR only)
GET    /api/kpi/team                                → the manager's team for the My Team tab (label + members)
GET    /api/settings/departments                  → departments with staff counts + managers, and staff for the picker (HR only)
PUT    /api/departments/[id]/managers              → set a department's managers (full list; several allowed) (HR only)
GET/PATCH /api/settings/access                    → who can see what: everyone's Reports to / access / login; bulk-set Reports to or access (HR only; no reporting loops)
GET/PUT /api/settings/ai                           → AI settings, usage, recent runs (HR only; key never returned)
POST/DELETE /api/settings/ai/key                   → save (validated with OpenAI) / remove the API key
POST   /api/settings/ai/test                        → test key, list models
POST   /api/settings/ai/preview                     → try the prompt on a review (dry run, logged, counts to cap)
```

### KPI access rules

| Action | HR/Admin | Invitee (accepted) | Manager | Staff |
|---|---|---|---|---|
| View all reviews | ✅ | ❌ | Published reviews of their team | ❌ |
| Create / delete review | ✅ | ❌ | ❌ | ❌ |
| Add / remove invitees | ✅ | ❌ | ❌ | ❌ |
| Score HR sections | ✅ | ❌ | ❌ | ❌ |
| Score invitee sections | ❌ | ✅ own rows only, **draft only** | as invitee only | ❌ |
| View own KPI summary | ✅ | ✅ | ✅ | ✅ |

**Publish lock:** once HR publishes a review (status `active`/`completed`), only
HR can change scores or final comments; everyone else is view-only (enforced in
the scores + final-comments PUT routes). Review read access is centralised in
`src/lib/kpi/access.ts` (`canViewReview`).

### Scoring logic

- `scorer_id = null` → score submitted by HR
- `scorer_id = invitee.id` → score submitted by that invitee
- Final score per item = average of all submitted numeric scores for that item
- Section score = sum of per-item final scores
- Overall score = sum of all section scores

---

## Supabase Client Pattern

```typescript
// Server components and Route Handlers — always use this
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createSupabaseServerClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}

// Client components only
import { createBrowserClient } from '@supabase/ssr'
```

Never use the browser client in Route Handlers or server components.

---

## API Route Pattern

Every protected Route Handler must follow this pattern:

```typescript
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth'

export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== 'hr_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // fetch and return data
}
```

Always return proper HTTP status codes: 400, 401, 403, 404, 500.

---

## Component Conventions

- Shared UI components → `src/components/ui/`
- Layout components (sidebar, shell, page header) → `src/components/layout/`
- Utility functions → `src/lib/`
- Supabase client helpers → `src/lib/supabase/`
- Auth helpers (getUserRole, etc.) → `src/lib/auth.ts`
- No `data/` folder — no mock data, ever
- Use `cn()` from `clsx` + `tailwind-merge` for conditional classes
- **AI:** every OpenAI call goes through `generateText` in `src/lib/ai/openai.ts`
  (Vault key, monthly spend cap, `ai_runs` logging, Responses API with
  `store: false` and a hashed `safety_identifier`). Send the minimum personal
  data (no names unless `include_names`; never ID, contact or banking). AI output
  that staff will read must go through HR approval first. Default prompts live
  in `src/lib/ai/prompts.ts`; prices for the cost estimate in `src/lib/ai/pricing.ts`.

---

## Build Rules

1. **Build page by page.** Complete one page fully (API routes + UI + access control) before starting the next.
2. **No UI without backend enforcement.** Access rules live in API routes, not components.
3. **No placeholder data.** If data isn't in Supabase yet, show an empty state.
4. **Sensitive fields masked by default.** Bank account numbers, identity numbers → `••••••••` with a reveal toggle (HR/Admin only).
5. **Server components where possible.** Use client components only for interactivity: search inputs, filters, modals, score entry.
6. **Never modify the login page or `middleware.ts`** unless explicitly asked.
7. **Scope is fixed.** Employees + KPI only. Do not scaffold other modules.

---

## Current Build Status

| Page / Feature | Status |
|---|---|
| Login page | ✅ Done |
| Middleware / auth guard | ✅ Done |
| App shell (sidebar, topbar, layout) | ✅ Done |
| Employee list (`/employees`) | ✅ Done |
| `GET /api/employees` | ✅ Done |
| Employee detail (`/employees/[id]`) | ✅ Done |
| `GET /api/employees/[id]` | ✅ Done |
| `GET /api/employees/[id]/leave` | ✅ Done |
| `GET /api/employees/[id]/documents` | ✅ Done |
| `GET+POST /api/employees/[id]/notes` | ✅ Done |
| `GET /api/employees/[id]/kpi-summary` | ✅ Done |
| `PATCH /api/documents/[id]/visibility` | ✅ Done |
| Employee edit (`/employees/[id]/edit`) | ✅ Done |
| `PATCH /api/employees/[id]` | ✅ Done |
| `GET /api/departments` | ✅ Done |
| KPI reviews list (`/kpi`) | ✅ Done |
| KPI review detail | ✅ Done — inline accordion on `/kpi` (no separate route needed) |
| `GET /api/employees/me` | ✅ Done |
| `GET /api/employees/active` | ✅ Done |
| `POST /api/employees/[id]/invite` | ✅ Done |
| All KPI API routes | ✅ Done |
| Supabase KPI tables migration | ✅ Done |
| Staff inline edit (contact + next of kin) | ✅ Done |
| Training module (add/edit/delete, cert upload) | ✅ Done |
| `GET/POST /api/employees/[id]/training` | ✅ Done |
| `PATCH/DELETE /api/employees/[id]/training/[id]` | ✅ Done |
| KPI removed from employee profiles (tab is "Training"; KPIs live only on `/kpi`) | ✅ Done |
| Leave tab removed (future phase) | ✅ Done |
| KPI per-period templates (select/edit a period's template; new period copies from another) | ✅ Done |
| KPI rating guide (global 1–10 rubric; HR edits, all view) | ✅ Done |
| Alphabetical A–Z / Z–A sort on Employees + KPI lists | ✅ Done |
| KPI Q1-as-default inheritance (new Q2/Q3/Q4 review auto-inherits period template + staff's baseline-quarter KPIs; template baseline = same-year Q1, else earliest existing same-year quarter, else latest prior-year period; the staff member's own custom KPIs + Values overrides are copied from their most recent EARLIER review, so Q3→Q4 and Q4→next year's Q1; editable after) | ✅ Done |
| Multi-year KPI support (year filter with current-year default; year-aware quarter↔period; create/set up future-year reviews) | ✅ Done |
| KPI Action Points — AI draft auto-generated when HR marks a review Complete (status → `completed`, once per transition; skipped if HR already approved/edited); HR approves before staff see it. Opening a completed review with no draft/approved text drafts it then (backfill + retry). Manual "draft with AI" still works once published | ✅ Done |
| KPI quarter + year performance summary (Q1–Q4 + year score, % and /10 via rating guide) | ✅ Done |
| Archive cascade (archiving an employee archives their KPI reviews; archived reviews hidden from lists) | ✅ Done |
| HR "View as" any active/onboarding staff member (exact view, their role; view-only enforced on every write API) | ✅ Done |
| Staff see only their own profile (land on it after login; sidebar "My Profile") | ✅ Done |
| Department heads — replaced by manager access levels on 28 Sep 2026 | ✅ Done |
| KPI publish lock (reviewers edit only while draft; HR-only after publish) | ✅ Done |
| Staff portal logins (HR temp passwords, role, disable/restore; change password) | ✅ Built — deploy pending |
| Database RLS hardening | ✅ Applied — final column grant (`20260926_06`) pending deploy |
| Monthly manager check-ins | ❌ Removed 28 Sep 2026 (no longer used). UI, API and reminder email deleted; `kpi_monthly_checkins` table left in the DB untouched |
| Training tracker + weekly HR expiry reminder (Mondays) | ✅ Built — deploy pending |
| HR digests of staff self-edits: profile changes daily (field names only, no values), new training weekly (Mondays). Queue = `hr_change_log` (service role only, migration `20261007_01`), written by `PATCH /api/employees/[id]` and `POST …/training` for non-HR callers, sent by the daily keepalive cron via `src/lib/hr-digests.ts` to Settings → Notifications "Staff changes digests go to" (`staff_changes_notify_emails`; empty = all HR admins) | ✅ Built — migration + deploy pending |
| Quarterly HR report (`/kpi/report`) | ✅ Built — deploy pending |
| Manager access levels: direct reports / whole reporting line / whole department (login card) + Settings "Who can see what" | ✅ Done |
| Document upload on the employee profile (HR: drag & drop / choose files, category, hide from staff, delete; private bucket, 25 MB/file) | ✅ Done |
| Settings tabs (Administrators, Departments, Who can see what, Notifications, AI) | ✅ Done |
| Settings → Departments: add/edit/delete + pick managers (several per department). A department manager = person in that department with `access_level = manager_department`; removing one resets them to `manager_reports` (if anyone reports to them) or `staff`; deleting a department does the same for its managers | ✅ Done |
| AI settings (encrypted key, model, prompt + try-it, spend cap, usage log) + HR approval/editing of action points | ✅ Done |
| Access on the person (not the login) + editable "Who can see what" (filters, bulk Reports to / access, team view) | ✅ Done |
| KPI page tabs split by purpose: My KPI / My Team / Reviews to Score | ✅ Done |
| Activity log (HR-only `/logs`, sidebar under Staff Directory): `activity_log` table (migration `20261008_01`, service role only). Every mutating API route is wrapped in `withAudit(handler, {section, action, target, fields})` from `src/lib/activity-log.ts` — logs successful writes (who, section, action, on whom; profile edits record field NAMES only, never values). Sign-ins are logged by `POST /api/auth/touch` via `logLoginIfNew` (deduped on `last_sign_in_at`). **New write routes must be wrapped in `withAudit`.** `GET /api/logs` (HR only) | ✅ Done |
| Onboarding KPIs: staff with status `onboarding` are reviewed in `Month 1/2/3` (no quarters or year score); once `active` they start Q1–Q4 and the Month reviews stay on record, labelled "Onboarding KPI". Period rules in `src/lib/kpi/onboarding.ts` (enforced in the reviews POST/PATCH); `/kpi` has an Onboarding / Permanent staff filter; Month templates are cloned from the current quarter's template (Month 2/3 from Month 1) | ✅ Built |

Update this table as features are completed.

---

## Reference Project

```
/Users/mineshsingh/Documents/Wetpaint/SAAS/WP Human Connections
```

Reference pages to look at per feature:
- Employee list → `src/app/(app)/employees/page.tsx`
- Employee detail → `src/app/(app)/employees/[id]/page.tsx`
- KPI page → `src/app/(app)/kpi/page.tsx`

Use the reference for UI patterns, component layout, business logic, and field names.
Adapt for production: remove `DemoShell`, replace mock data hooks (`useHRData`) with real Supabase queries, and enforce real auth in every API route.
