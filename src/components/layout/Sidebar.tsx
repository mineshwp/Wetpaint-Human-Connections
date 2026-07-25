"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { Users, BarChart3, X, LayoutGrid, Settings, Contact } from "lucide-react"
import { cn } from "@/lib/utils"

const ALL_NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid, staffOnly: true },
  { href: "/employees", label: "Employees", icon: Users, staffOnly: false },
  { href: "/kpi", label: "KPI Reviews", icon: BarChart3, staffOnly: false },
  { href: "/directory", label: "Staff Directory", icon: Contact, staffOnly: false },
]

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
  roleBadge: string
  isHR?: boolean
  isImpersonating?: boolean
}

export function Sidebar({ isOpen, onClose, roleBadge, isHR, isImpersonating }: SidebarProps) {
  const pathname = usePathname()

  const navItems = ALL_NAV_ITEMS.filter((item) =>
    isImpersonating ? item.href !== "/employees" : !item.staffOnly
  )

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

        {/* Role badge — hidden in staff view */}
        {!isImpersonating && (
          <div className="px-5 py-3 border-b border-border">
            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-primary/10 text-primary">
              {roleBadge}
            </span>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-0.5">
            {navItems.map((item) => {
              const active = pathname.startsWith(item.href)
              const Icon = item.icon
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground/80 hover:bg-muted hover:text-foreground"
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Footer */}
        <div className="shrink-0 border-t border-border px-3 py-3 space-y-1">
          {isHR && !isImpersonating && (
            <Link
              href="/settings"
              onClick={onClose}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                pathname.startsWith("/settings")
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground/80 hover:bg-muted hover:text-foreground"
              )}
              aria-current={pathname.startsWith("/settings") ? "page" : undefined}
            >
              <Settings className="h-4 w-4 shrink-0" />
              <span className="truncate">Settings</span>
            </Link>
          )}
          <p className="px-2.5 text-[11px] text-muted-foreground">
            © {new Date().getFullYear()} Wetpaint Advertising
          </p>
        </div>
      </aside>
    </>
  )
}
