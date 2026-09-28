"use client"

import { useState } from "react"
import Link from "next/link"
import { ShieldCheck, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import type { AccessRow } from "@/lib/access-overview"

const LOGIN_BADGE: Record<AccessRow["login"], { text: string; cls: string }> = {
  none: { text: "No login", cls: "bg-muted text-muted-foreground border-border" },
  pending: { text: "Not signed in yet", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  active: { text: "Active", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  disabled: { text: "Disabled", cls: "bg-red-50 text-red-700 border-red-200" },
}

// HR's single view of who can see what. Changes are made where they live:
// access level on the person's profile (Portal login), heads in Manage
// departments, and team membership via Edit → Department / Reports to.
export function AccessOverview({ rows }: { rows: AccessRow[] }) {
  const [q, setQ] = useState("")
  const visible = rows.filter((r) =>
    `${r.name} ${r.department ?? ""} ${r.access} ${r.reportsTo ?? ""}`.toLowerCase().includes(q.toLowerCase())
  )

  return (
    <section className="rounded-2xl border border-border bg-card">
      <div className="px-5 py-4 border-b border-border space-y-1">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-primary" />
          <h2 className="font-bold text-lg">Who can see what</h2>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Change a person&apos;s access on their profile (Portal login card). Department heads are set in
          Employees → Manage departments and see their whole department. A manager on
          &ldquo;direct reports&rdquo; sees the people whose <span className="font-medium">Reports to</span> is
          them (Edit employee). Everyone can always see their own profile.
        </p>
      </div>

      <div className="px-5 py-3 border-b border-border">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people, departments or access"
            className="w-full h-9 rounded-lg border border-border bg-card pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="text-left font-semibold px-4 py-2">Person</th>
              <th className="text-left font-semibold px-4 py-2">Login</th>
              <th className="text-left font-semibold px-4 py-2">Access</th>
              <th className="text-left font-semibold px-4 py-2">Can see</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.map((r) => {
              const b = LOGIN_BADGE[r.login]
              return (
                <tr key={r.employeeId} className="align-top">
                  <td className="px-4 py-2.5">
                    <Link href={`/employees/${r.employeeId}`} className="font-medium hover:text-primary">{r.name}</Link>
                    <div className="text-xs text-muted-foreground">
                      {r.department ?? "No department"}{r.reportsTo ? ` · reports to ${r.reportsTo}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={cn("text-[11px] font-medium rounded-full border px-2 py-0.5 whitespace-nowrap", b.cls)}>{b.text}</span>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{r.access}</td>
                  <td className="px-4 py-2.5">
                    <span>{r.sees}</span>
                    {r.seesCount != null && r.seesCount > 0 && r.access !== "HR / Admin" && (
                      <span className="text-xs text-muted-foreground"> · {r.seesCount} {r.seesCount === 1 ? "person" : "people"}</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {visible.length === 0 && <p className="px-5 py-6 text-sm text-muted-foreground italic">Nobody matches.</p>}
      </div>
    </section>
  )
}
