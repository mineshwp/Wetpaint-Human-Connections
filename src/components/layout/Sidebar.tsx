"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { Users, User, BarChart3, X, LayoutGrid, Settings, Contact, ScrollText, Inbox, Bug, Lightbulb, CircleHelp, BookOpenCheck, MessagesSquare } from "lucide-react"
import type { FeedbackKind } from "@/lib/feedback"
import { cn } from "@/lib/utils"

const ALL_NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid, staffOnly: true, hrOnly: false },
  { href: "/employees", label: "Employees", icon: Users, staffOnly: false, hrOnly: false },
  { href: "/kpi", label: "KPI Reviews", icon: BarChart3, staffOnly: false, hrOnly: false },
  { href: "/directory", label: "Staff Directory", icon: Contact, staffOnly: false, hrOnly: false },
  { href: "/logs", label: "Logs", icon: ScrollText, staffOnly: false, hrOnly: true },
  { href: "/feedback", label: "Feedback", icon: Inbox, staffOnly: false, hrOnly: true },
]

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
  roleBadge: string
  isHR?: boolean
  /** Link to the user's own record, shown as "My Profile". */
  ownProfileHref?: string | null
  /**
   * Managers keep "Employees" and get "My Profile" added
   * after it; for staff "Employees" is replaced by "My Profile".
   */
  keepEmployeesLink?: boolean
  /** Opens the "Report an Issue" / "Share an Idea" dialog (rendered by AppShell). */
  onFeedback: (kind: FeedbackKind) => void
  /** Red count bubbles by link, e.g. unread replies on "My Feedback". */
  badges?: Record<string, number>
}

function Badge({ count }: { count: number | undefined }) {
  if (!count) return null
  return (
    <span className="ml-auto shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-foreground group-aria-[current=page]:bg-white group-aria-[current=page]:text-primary">
      {count > 9 ? "9+" : count}
    </span>
  )
}

// Driven purely by the effective role, so an HR "view as" session renders the
// exact same navigation the viewed person gets.
export function Sidebar({ isOpen, onClose, roleBadge, isHR, ownProfileHref, keepEmployeesLink, onFeedback, badges = {} }: SidebarProps) {
  const pathname = usePathname()

  const navItems = ALL_NAV_ITEMS.filter((item) => !item.staffOnly && (!item.hrOnly || isHR)).flatMap((item) => {
    if (item.href !== "/employees" || !ownProfileHref) return [item]
    const myProfile = { ...item, href: ownProfileHref, label: "My Profile", icon: User }
    return keepEmployeesLink ? [item, myProfile] : [myProfile]
  })

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex w-[220px] flex-col bg-card border-r border-border",
          "transition-transform duration-200 ease-in-out",
          "lg:static lg:translate-x-0 lg:z-auto",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Branding */}
        <div className="flex h-16 shrink-0 items-center justify-between px-5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <Image
              src="/cropped-wpw-01.png"
              alt="Wetpaint"
              width={36}
              height={36}
              className="h-9 w-9 object-contain"
              priority
            />
            <div className="flex flex-col leading-none">
              <span className="text-sm font-bold text-foreground">Human</span>
              <span className="text-xs text-muted-foreground">Connections</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-border">
          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-primary/10 text-primary">
            {roleBadge}
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-0.5">
            {navItems.map((item) => {
              // On your own profile, highlight "My Profile" rather than "Employees".
              const onOwnProfile = !!ownProfileHref && pathname.startsWith(ownProfileHref)
              const active = item.href === "/employees" && onOwnProfile ? false : pathname.startsWith(item.href)
              const Icon = item.icon
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground/80 hover:bg-muted hover:text-foreground"
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                    <Badge count={badges[item.href]} />
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Footer */}
        <div className="shrink-0 border-t border-border px-3 py-3 space-y-1">
          {([
            { kind: "problem" as const, label: "Report an Issue", icon: Bug },
            { kind: "idea" as const, label: "Share an Idea", icon: Lightbulb },
          ]).map(({ kind, label, icon: Icon }) => (
            <button
              key={kind}
              type="button"
              onClick={() => { onClose(); onFeedback(kind) }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          ))}
          {[
            { href: "/my-feedback", label: "My Feedback", icon: MessagesSquare, show: true, exact: true },
            { href: "/help", label: "Help", icon: CircleHelp, show: true, exact: true },
            { href: "/help/admin", label: "Admin Help", icon: BookOpenCheck, show: !!isHR, exact: true },
            { href: "/settings", label: "Settings", icon: Settings, show: !!isHR, exact: false },
          ].filter((l) => l.show).map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={cn(
                  "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                  active ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-muted hover:text-foreground"
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{label}</span>
                <Badge count={badges[href]} />
              </Link>
            )
          })}
          <p className="px-2.5 text-[11px] text-muted-foreground">
            © {new Date().getFullYear()} Wetpaint Advertising
          </p>
        </div>
      </aside>
    </>
  )
}
