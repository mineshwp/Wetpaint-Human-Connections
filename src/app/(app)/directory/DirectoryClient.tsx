"use client"

import { useState, useMemo } from "react"
import { Search, Mail, MessageCircle, Phone, Users, LayoutGrid, List } from "lucide-react"
import { cn } from "@/lib/utils"

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

// Convert a stored number to international digits, assuming South Africa (+27)
// for local numbers. Numbers already in international form are kept.
function intlDigits(phone: string | null): string | null {
  if (!phone) return null
  const d = phone.replace(/\D/g, "")
  if (!d) return null
  if (d.startsWith("27")) return d
  if (d.startsWith("0")) return "27" + d.slice(1)
  return "27" + d
}
function whatsappLink(phone: string | null): string | null {
  const d = intlDigits(phone)
  return d ? `https://wa.me/${d}` : null
}
function telLink(phone: string | null): string | null {
  const d = intlDigits(phone)
  return d ? `tel:+${d}` : null
}
// Opens Outlook on the web with a new message pre-addressed to the person.
// Reliable regardless of the device's default mail handler.
function emailLink(email: string | null): string | null {
  return email ? `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(email)}` : null
}

function ContactActions({ entry, compact }: { entry: DirectoryEntry; compact?: boolean }) {
  const tel = telLink(entry.phone)
  const wa = whatsappLink(entry.phone)
  const mail = emailLink(entry.email)
  const btn = "flex items-center justify-center rounded-lg border transition-colors"
  const size = compact ? "h-8 w-8" : "h-8 w-8"
  return (
    <div className={cn("flex items-center gap-1.5", compact && "justify-end")}>
      {tel ? (
        <a href={tel} title={`Call ${entry.phone}`} aria-label="Call"
          className={cn(btn, size, "border-border text-slate-600 hover:bg-slate-50 hover:border-slate-300")}>
          <Phone size={14} />
        </a>
      ) : null}
      {wa ? (
        <a href={wa} target="_blank" rel="noopener noreferrer" title={`WhatsApp ${entry.phone}`} aria-label="WhatsApp"
          className={cn(btn, size, "border-border text-emerald-600 hover:bg-emerald-50 hover:border-emerald-200")}>
          <MessageCircle size={14} />
        </a>
      ) : null}
      {mail ? (
        <a href={mail} target="_blank" rel="noopener noreferrer" title={`Email ${entry.email}`} aria-label="Email"
          className={cn(btn, size, "border-border text-blue-600 hover:bg-blue-50 hover:border-blue-200")}>
          <Mail size={14} />
        </a>
      ) : null}
    </div>
  )
}

function Avatar({ entry, size }: { entry: DirectoryEntry; size: number }) {
  const cls = `shrink-0 rounded-full object-cover`
  return entry.photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={entry.photoUrl} alt={entry.name} className={cls} style={{ width: size, height: size }} />
  ) : (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, background: "var(--brand-primary)", fontSize: size * 0.34 }}
    >
      {entry.initials}
    </div>
  )
}

export function DirectoryClient({ entries }: { entries: DirectoryEntry[] }) {
  const [search, setSearch] = useState("")
  const [deptFilter, setDeptFilter] = useState("all")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")

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

        <div className="ml-auto flex items-center rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => setViewMode("grid")}
            className={cn("flex h-9 w-9 items-center justify-center transition-colors",
              viewMode === "grid" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted")}
            aria-label="Grid view" aria-pressed={viewMode === "grid"}
          >
            <LayoutGrid size={15} />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={cn("flex h-9 w-9 items-center justify-center transition-colors border-l border-border",
              viewMode === "list" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted")}
            aria-label="List view" aria-pressed={viewMode === "list"}
          >
            <List size={15} />
          </button>
        </div>
      </div>

      <p className="mb-3 text-xs text-muted-foreground">
        {filtered.length} {filtered.length === 1 ? "person" : "people"}
      </p>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-3 rounded-2xl border border-dashed border-border">
          <Users size={28} className="opacity-30" />
          <p className="text-sm">No one matches your search.</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((e) => (
            <div key={e.id} className="rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3">
                <Avatar entry={e} size={48} />
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

              <div className="mt-3 space-y-1">
                {e.phone ? (
                  <p className="text-xs text-muted-foreground truncate">{e.phone}</p>
                ) : (
                  <p className="text-xs text-muted-foreground/70 italic">No number</p>
                )}
                {e.email ? (
                  <p className="text-xs text-muted-foreground truncate">{e.email}</p>
                ) : (
                  <p className="text-xs text-muted-foreground/70 italic">No email</p>
                )}
              </div>

              <div className="mt-3 pt-3 border-t border-border">
                <ContactActions entry={e} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground hidden sm:table-cell">Department</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground hidden md:table-cell">Contact</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Reach out</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar entry={e} size={36} />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{e.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{e.jobTitle || "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {e.department ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: e.departmentColour ?? "#9ca3af" }} />
                          {e.department}
                        </span>
                      ) : <span className="text-xs text-muted-foreground/70">—</span>}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="text-xs text-muted-foreground">
                        <div className="truncate">{e.phone ?? <span className="italic opacity-70">No number</span>}</div>
                        <div className="truncate">{e.email ?? <span className="italic opacity-70">No email</span>}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ContactActions entry={e} compact />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
