"use client"

import { useState, useMemo } from "react"
import { Search, Mail, MessageCircle, Users } from "lucide-react"

export interface DirectoryEntry {
  id: string
  name: string
  jobTitle: string
  department: string | null
  departmentColour: string | null
  phone: string | null
  email: string | null
  photoUrl: string | null
  initials: string
}

// Build a wa.me link, assuming South African numbers (+27) when a local
// number is given. Numbers already in international form are kept.
function whatsappLink(phone: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, "")
  if (!digits) return null
  let intl: string
  if (digits.startsWith("27")) intl = digits
  else if (digits.startsWith("0")) intl = "27" + digits.slice(1)
  else intl = "27" + digits
  return `https://wa.me/${intl}`
}

export function DirectoryClient({ entries }: { entries: DirectoryEntry[] }) {
  const [search, setSearch] = useState("")
  const [deptFilter, setDeptFilter] = useState("all")

  const departments = useMemo(() => {
    const set = new Set<string>()
    for (const e of entries) if (e.department) set.add(e.department)
    return Array.from(set).sort()
  }, [entries])

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (deptFilter !== "all" && e.department !== deptFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        return (
          e.name.toLowerCase().includes(q) ||
          e.jobTitle.toLowerCase().includes(q) ||
          (e.department ?? "").toLowerCase().includes(q) ||
          (e.phone ?? "").toLowerCase().includes(q) ||
          (e.email ?? "").toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [entries, search, deptFilter])

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search name, role, department, number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
          />
        </div>
        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-ring"
        >
          <option value="all">All departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      <p className="mb-3 text-xs text-muted-foreground">
        {filtered.length} {filtered.length === 1 ? "person" : "people"}
      </p>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-3 rounded-2xl border border-dashed border-border">
          <Users size={28} className="opacity-30" />
          <p className="text-sm">No one matches your search.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((e) => {
            const wa = whatsappLink(e.phone)
            return (
              <div key={e.id} className="rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3">
                  {e.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.photoUrl} alt={e.name} className="h-12 w-12 shrink-0 rounded-full object-cover" />
                  ) : (
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-bold text-white"
                      style={{ background: "var(--brand-primary)" }}
                    >
                      {e.initials}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{e.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{e.jobTitle || "—"}</p>
                    {e.department && (
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: e.departmentColour ?? "#9ca3af" }} />
                        <span className="text-[11px] text-muted-foreground truncate">{e.department}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3 space-y-1.5">
                  {wa ? (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs text-foreground hover:bg-emerald-50 hover:border-emerald-200 transition-colors"
                    >
                      <MessageCircle size={13} className="shrink-0 text-emerald-600" />
                      <span className="truncate">{e.phone}</span>
                    </a>
                  ) : (
                    <div className="flex items-center gap-2 rounded-lg border border-border/60 px-2.5 py-1.5 text-xs text-muted-foreground">
                      <MessageCircle size={13} className="shrink-0 opacity-40" />
                      <span className="italic">No number</span>
                    </div>
                  )}

                  {e.email ? (
                    <a
                      href={`mailto:${e.email}`}
                      className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs text-foreground hover:bg-blue-50 hover:border-blue-200 transition-colors"
                    >
                      <Mail size={13} className="shrink-0 text-blue-600" />
                      <span className="truncate">{e.email}</span>
                    </a>
                  ) : (
                    <div className="flex items-center gap-2 rounded-lg border border-border/60 px-2.5 py-1.5 text-xs text-muted-foreground">
                      <Mail size={13} className="shrink-0 opacity-40" />
                      <span className="italic">No email</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
