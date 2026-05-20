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

---

## Role System

Roles are stored in Supabase (table: `user_roles` or a `roles` column on the user profile — confirm from DB before building).

| Role | Access |
|---|---|
| `hr_admin` | Full access |
| `manager` | Department/team view only |
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
/kpi                            → KPI reviews list + inline detail accordion (HR/Admin + assigned invitees)
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
4. **Training & KPIs** — KPI summary card linking to `/kpi`; training placeholder
5. **Documents** — file list with HR visibility toggle (HR can hide docs from staff view)
6. **HR Notes** — HR/Admin only; private internal notes

### Access rules (enforce server-side)

| Data | HR/Admin | Manager | Staff |
|---|---|---|---|
| View employee list | ✅ All | ✅ Own dept only | ❌ |
| View personal details | ✅ | ✅ Basic only | Own only |
| View banking/payroll | ✅ | ❌ | ❌ |
| View documents | ✅ | ❌ | Own only |
| View HR notes | ✅ | ❌ | ❌ |
| Edit employee record | ✅ | ❌ | Own profile only |

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
GET    /api/employees/[id]/notes             → HR notes (HR only)
POST   /api/employees/[id]/notes             → add HR note (HR only)
POST   /api/employees/[id]/invite            → send Supabase invite email (HR only)
```

---

## KPI Module

### Data model (Supabase tables)

```
kpi_template_sections
  id, title, type ("hr" | "invitee"), position, is_active

kpi_template_items
  id, section_id, title, description, min_score, max_score, position, is_active

kpi_reviews
  id, employee_id, period, title, deadline, status ("draft" | "active" | "completed")

kpi_review_invitees
  id, review_id, invitee_id, status ("pending" | "accepted" | "declined" | "completed")

kpi_scores
  id, review_id, item_id, scorer_id (null = HR scored), score, comments

kpi_settings
  key, value  (e.g. key="current_period", value="Q1 2026")
```

### API routes needed

```
GET    /api/kpi/template                           → all active sections + items
GET    /api/kpi/reviews                            → all reviews (HR) or own assignments (staff/invitee)
POST   /api/kpi/reviews                            → create review (HR only)
GET    /api/kpi/reviews/[id]                       → single review with invitees
PATCH  /api/kpi/reviews/[id]                       → update status (HR only)
DELETE /api/kpi/reviews/[id]                       → delete review (HR only)
GET    /api/kpi/reviews/[id]/scores                → all scores for a review
PUT    /api/kpi/reviews/[id]/scores                → upsert a score entry
POST   /api/kpi/reviews/[id]/invitees              → add invitees (HR only)
DELETE /api/kpi/reviews/[id]/invitees              → remove invitee (HR only)
POST   /api/kpi/invitees/[id]/respond              → accept or decline invite
GET    /api/kpi/settings                           → fetch settings (e.g. current_period)
POST   /api/kpi/template/sections/[id]             → add item to section (HR only)
```

### KPI access rules

| Action | HR/Admin | Invitee (accepted) | Staff |
|---|---|---|---|
| View all reviews | ✅ | ❌ | ❌ |
| Create / delete review | ✅ | ❌ | ❌ |
| Add / remove invitees | ✅ | ❌ | ❌ |
| Score HR sections | ✅ | ❌ | ❌ |
| Score invitee sections | ❌ | ✅ own rows only | ❌ |
| View own KPI summary | ✅ | ✅ | ✅ |

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
| KPI inline accordion on Training & KPIs tab | ✅ Done |
| Leave tab removed (future phase) | ✅ Done |

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
