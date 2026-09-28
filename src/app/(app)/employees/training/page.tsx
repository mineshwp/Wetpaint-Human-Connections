import Link from "next/link"
import { redirect } from "next/navigation"
import { AlertTriangle, CalendarClock, ChevronLeft, GraduationCap } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"
import { PageHeader } from "@/components/layout/PageHeader"
import { EXPIRY_WARNING_DAYS, groupByExpiry, loadTraining, type TrainingRow } from "@/lib/training"
import { cn } from "@/lib/utils"

export const metadata = { title: "Training tracker — Human Connections" }

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : "—"
}

function Table({ rows, highlight }: { rows: TrainingRow[]; highlight?: "expired" | "expiring" }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="text-left font-semibold px-3 py-2">Staff member</th>
            <th className="text-left font-semibold px-3 py-2">Training</th>
            <th className="text-left font-semibold px-3 py-2 hidden sm:table-cell">Provider</th>
            <th className="text-left font-semibold px-3 py-2">Completed</th>
            <th className="text-left font-semibold px-3 py-2">Expires</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2">
                <Link href={`/employees/${r.employeeId}`} className="font-medium hover:text-primary">{r.employeeName}</Link>
                {r.department && <div className="text-xs text-muted-foreground">{r.department}</div>}
              </td>
              <td className="px-3 py-2">{r.name}</td>
              <td className="px-3 py-2 hidden sm:table-cell text-muted-foreground">{r.provider ?? "—"}</td>
              <td className="px-3 py-2 whitespace-nowrap">{fmt(r.dateCompleted)}</td>
              <td className={cn("px-3 py-2 whitespace-nowrap",
                highlight === "expired" && "text-red-700 font-medium",
                highlight === "expiring" && "text-amber-700 font-medium")}>{fmt(r.expiryDate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// HR-only overview of every training record, with what has expired or is due
// to expire first. Records are added on each employee's Training tab.
export default async function TrainingTrackerPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") redirect("/employees")

  const rows = await loadTraining(supabase)
  const { expired, expiring } = groupByExpiry(rows)

  return (
    <div className="space-y-6">
      <Link href="/employees" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft size={14} /> Employees
      </Link>
      <PageHeader
        title="Training tracker"
        subtitle={`${rows.length} record${rows.length === 1 ? "" : "s"} · ${expired.length} expired · ${expiring.length} expiring in ${EXPIRY_WARNING_DAYS} days`}
      />

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <GraduationCap size={36} className="opacity-30" />
          <p className="text-sm">No training records yet. Add them from each employee&apos;s Training tab.</p>
        </div>
      ) : (
        <>
          {expired.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-1.5 text-red-700">
                <AlertTriangle size={15} /> Expired — follow up
              </h3>
              <Table rows={expired} highlight="expired" />
            </section>
          )}
          {expiring.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-1.5 text-amber-700">
                <CalendarClock size={15} /> Expiring in the next {EXPIRY_WARNING_DAYS} days
              </h3>
              <Table rows={expiring} highlight="expiring" />
            </section>
          )}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">All training</h3>
            <Table rows={rows} />
          </section>
        </>
      )}
    </div>
  )
}
