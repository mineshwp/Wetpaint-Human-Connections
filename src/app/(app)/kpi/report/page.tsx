import Link from "next/link"
import { redirect } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getUserRole } from "@/lib/auth"
import { PageHeader } from "@/components/layout/PageHeader"
import { monthLabel, monthStart, periodMonths } from "@/lib/kpi/months"
import { groupByExpiry, loadTraining } from "@/lib/training"
import { PrintButton } from "./PrintButton"

export const metadata = { title: "Quarterly HR report — Human Connections" }

function currentQuarter(d = new Date()) {
  return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`
}

function recentQuarters(n = 6): string[] {
  const out: string[] = []
  const d = new Date()
  let q = Math.floor(d.getMonth() / 3) + 1
  let y = d.getFullYear()
  for (let i = 0; i < n; i++) {
    out.push(`Q${q} ${y}`)
    q -= 1
    if (q === 0) { q = 4; y -= 1 }
  }
  return out
}

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      {note && <div className="text-xs text-muted-foreground">{note}</div>}
    </div>
  )
}

// HR-only quarterly numbers for HR's quarterly update: headcount movement,
// KPI review progress and training. Printable.
export default async function QuarterlyReportPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") redirect("/kpi")

  const { q } = await searchParams
  const quarter = q && periodMonths(q).length ? q : currentQuarter()
  const months = periodMonths(quarter)
  const qStart = monthStart(months[0])
  const [ey, em] = months[2].split("-").map(Number)
  const qEnd = new Date(Date.UTC(ey, em, 0)).toISOString().slice(0, 10)

  // HR checked above; service client so resignation dates etc. are readable.
  const admin = createAdminClient()
  const [{ data: emps }, { data: reviews }, training] = await Promise.all([
    admin.from("employees").select("id, first_name, last_name, status, is_archived, start_date, resignation_date, department:departments(name)"),
    admin.from("kpi_reviews").select("id, employee_id, status").eq("period", quarter).eq("is_archived", false),
    loadTraining(supabase),
  ])

  const all = emps ?? []
  const current = all.filter((e) => !e.is_archived && ["active", "onboarding", "on-leave"].includes(e.status))
  const joined = all.filter((e) => e.start_date && e.start_date >= qStart && e.start_date <= qEnd)
  const left = all.filter((e) => e.resignation_date && e.resignation_date >= qStart && e.resignation_date <= qEnd)

  const revs = reviews ?? []
  const published = revs.filter((r) => r.status === "active" || r.status === "completed").length
  const reviewedIds = new Set(revs.map((r) => r.employee_id))
  const withoutReview = current.filter((e) => !reviewedIds.has(e.id)).length

  const completedTraining = training.filter((t) => t.dateCompleted && t.dateCompleted >= qStart && t.dateCompleted <= qEnd)
  const { expired, expiring } = groupByExpiry(training)

  const drafts = revs.length - published
  const outstanding = [
    drafts > 0 && `${drafts} KPI review${drafts === 1 ? "" : "s"} still pending`,
    withoutReview > 0 && `${withoutReview} current staff without a ${quarter} review`,
    expired.length > 0 && `${expired.length} training record${expired.length === 1 ? "" : "s"} expired`,
  ].filter(Boolean) as string[]

  return (
    <div className="space-y-6 max-w-4xl">
      <Link href="/kpi" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden">
        <ChevronLeft size={14} /> KPI Reviews
      </Link>
      <PageHeader title={`Quarterly HR report — ${quarter}`} subtitle={`${monthLabel(months[0])} to ${monthLabel(months[2])}`}>
        <form className="flex items-center gap-2 print:hidden">
          <select name="q" defaultValue={quarter} aria-label="Quarter"
            className="h-9 rounded-lg border border-border bg-card px-3 text-sm font-semibold">
            {recentQuarters().map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <button type="submit" className="h-9 rounded-lg border border-border bg-card px-3 text-sm hover:bg-muted">Show</button>
          <PrintButton />
        </form>
      </PageHeader>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">People</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Current staff" value={current.length} />
          <Stat label="Onboarding" value={current.filter((e) => e.status === "onboarding").length} />
          <Stat label="Joined this quarter" value={joined.length} note={joined.map((e) => e.first_name).join(", ") || undefined} />
          <Stat label="Left this quarter" value={left.length} note={left.map((e) => e.first_name).join(", ") || undefined} />
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">KPI reviews</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Stat label="Published" value={`${published} / ${current.length}`} />
          <Stat label="Pending" value={drafts} />
          <Stat label="No review yet" value={withoutReview} />
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Training</h3>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Completed this quarter" value={completedTraining.length} />
          <Stat label="Expired" value={expired.length} />
          <Stat label="Expiring in 60 days" value={expiring.length} />
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Outstanding</h3>
        {outstanding.length === 0
          ? <p className="text-sm text-muted-foreground">Nothing outstanding.</p>
          : <ul className="list-disc pl-5 space-y-1 text-sm">{outstanding.map((o) => <li key={o}>{o}</li>)}</ul>}
      </section>
    </div>
  )
}
