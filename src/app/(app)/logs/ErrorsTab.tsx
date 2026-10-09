"use client"

import { useCallback, useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, Loader2, Monitor, Server } from "lucide-react"
import { cn } from "@/lib/utils"

interface ErrorRow {
  id: string
  created_at: string
  source: "api" | "client"
  actor_name: string | null
  method: string | null
  route: string | null
  status: number | null
  message: string | null
  section: string | null
  target_name: string | null
  detail: string | null
  user_agent: string | null
}

interface Result { rows: ErrorRow[]; total: number; pageSize: number; sections: string[] }

const field = "h-9 rounded-lg border border-border bg-card px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"

function device(ua: string | null) {
  if (!ua) return null
  const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : null
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : null
  return [br, os].filter(Boolean).join(" on ") || null
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })

export function ErrorsTab({ staff }: { staff: { id: string; name: string }[] }) {
  const [employee, setEmployee] = useState("")
  const [source, setSource] = useState("")
  const [section, setSection] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Result | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const sp = new URLSearchParams({ page: String(page) })
    if (employee) sp.set("employee", employee)
    if (source) sp.set("source", source)
    if (section) sp.set("section", section)
    if (from) sp.set("from", from)
    if (to) sp.set("to", to)
    try {
      const res = await fetch(`/api/logs/errors?${sp}`)
      if (!res.ok) throw new Error()
      setData(await res.json())
    } catch {
      setError("Couldn't load the error log. Please try again.")
    } finally {
      setLoading(false)
    }
  }, [employee, source, section, from, to, page])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  const change = (fn: () => void) => { fn(); setPage(1) }
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const filtered = !!(employee || source || section || from || to)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Staff member
          <select className={cn(field, "min-w-[200px]")} value={employee} onChange={(e) => change(() => setEmployee(e.target.value))}>
            <option value="">Everyone</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Where it was caught
          <select className={field} value={source} onChange={(e) => change(() => setSource(e.target.value))}>
            <option value="">Server and browser</option>
            <option value="api">Server only</option>
            <option value="client">Browser only</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Section
          <select className={cn(field, "min-w-[180px]")} value={section} onChange={(e) => change(() => setSection(e.target.value))}>
            <option value="">All sections</option>
            {(data?.sections ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          From
          <input type="date" className={field} value={from} onChange={(e) => change(() => setFrom(e.target.value))} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          To
          <input type="date" className={field} value={to} onChange={(e) => change(() => setTo(e.target.value))} />
        </label>
        {filtered && (
          <button
            type="button" className="h-9 px-2 text-sm text-primary hover:underline"
            onClick={() => { setEmployee(""); setSource(""); setSection(""); setFrom(""); setTo(""); setPage(1) }}
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        {error ? (
          <p className="px-5 py-8 text-center text-sm text-destructive">{error}</p>
        ) : !data ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : data.rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            {filtered ? "Nothing matches those filters." : "No errors recorded. Failed saves will appear here from now on."}
          </p>
        ) : (
          <div className={cn("overflow-x-auto transition-opacity", loading && "opacity-50")}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-xs font-semibold text-muted-foreground">
                  <th className="px-4 py-2.5 whitespace-nowrap">When</th>
                  <th className="px-4 py-2.5">Who</th>
                  <th className="px-4 py-2.5">What went wrong</th>
                  <th className="px-4 py-2.5">Section</th>
                  <th className="px-4 py-2.5">On</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.rows.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{when(r.created_at)}</td>
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{r.actor_name ?? "Unknown"}</span>
                      {device(r.user_agent) && <p className="mt-0.5 text-xs text-muted-foreground">{device(r.user_agent)}</p>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        {r.source === "api"
                          ? <Server size={13} className="shrink-0 text-destructive" aria-label="Server" />
                          : <Monitor size={13} className="shrink-0 text-amber-600" aria-label="Browser" />}
                        {r.message ?? "Unknown error"}
                      </span>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[r.status ? `Status ${r.status}` : null, r.method, r.route].filter(Boolean).join(" · ")}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.section ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      {r.target_name ? <>{r.target_name}{r.detail && r.detail !== "client" ? <span className="text-muted-foreground"> · {r.detail}</span> : null}</> : <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{data.total} {data.total === 1 ? "error" : "errors"}</span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}
              className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-border bg-card disabled:opacity-40" aria-label="Previous page">
              <ChevronLeft size={14} />
            </button>
            <span>Page {page} of {pages}</span>
            <button type="button" disabled={page >= pages || loading} onClick={() => setPage((p) => p + 1)}
              className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-border bg-card disabled:opacity-40" aria-label="Next page">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
