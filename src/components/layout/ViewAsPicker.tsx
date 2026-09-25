"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Eye, Loader2, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface Person {
  id: string
  name: string
  jobTitle: string
  department: string | null
  status: string
  initials: string
  photoUrl: string | null
}

interface ViewAsPickerProps {
  onClose: () => void
  currentEmployeeId?: string | null
}

// HR/Admin: pick any active or onboarding employee and see the app exactly as
// they do (view only). The list and the switch are both enforced server-side
// in /api/impersonate.
export function ViewAsPicker({ onClose, currentEmployeeId }: ViewAsPickerProps) {
  const [people, setPeople] = useState<Person[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [switchingTo, setSwitchingTo] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    fetch("/api/impersonate")
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to load staff")
        return res.json()
      })
      .then(setPeople)
      .catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!people) return []
    if (!q) return people
    return people.filter((p) =>
      [p.name, p.jobTitle, p.department ?? ""].some((v) => v.toLowerCase().includes(q))
    )
  }, [people, query])

  async function choose(person: Person) {
    setSwitchingTo(person.id)
    setError(null)
    const res = await fetch("/api/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: person.id }),
    })
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't switch view")
      setSwitchingTo(null)
      return
    }
    // Land where they land after logging in.
    window.location.href = "/employees"
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="view-as-title"
        className="w-full max-w-md rounded-2xl bg-card border border-border shadow-xl flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Eye size={18} className="text-primary" />
            <h2 id="view-as-title" className="font-bold text-lg">View as a staff member</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pt-4 pb-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            See exactly what they see when they log in. View only — nothing can be changed while viewing.
          </p>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && filtered.length === 1 && !switchingTo) choose(filtered[0])
              }}
              placeholder="Search by name, job title or department"
              className="w-full rounded-md border border-border bg-card pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <ul className="overflow-y-auto px-2 pb-3">
          {people === null && !error && (
            <li className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" /> Loading staff…
            </li>
          )}
          {people !== null && filtered.length === 0 && (
            <li className="py-8 text-center text-sm text-muted-foreground">No matching staff</li>
          )}
          {filtered.map((p) => {
            const isCurrent = p.id === currentEmployeeId
            return (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={!!switchingTo || isCurrent}
                  onClick={() => choose(p)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                    isCurrent ? "bg-primary/5 cursor-default" : "hover:bg-muted disabled:opacity-60"
                  )}
                >
                  {p.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.photoUrl} alt="" className="h-8 w-8 rounded-full object-cover shrink-0" />
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                      {p.initials}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground truncate">{p.name}</span>
                    <span className="block text-xs text-muted-foreground truncate">
                      {[p.jobTitle, p.department].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {isCurrent ? (
                    <span className="text-[11px] font-medium text-primary">Viewing</span>
                  ) : p.status === "onboarding" ? (
                    <span className="text-[11px] font-medium text-amber-700 bg-amber-50 rounded-full px-2 py-0.5">Onboarding</span>
                  ) : null}
                  {switchingTo === p.id && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
