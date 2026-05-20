"use client"

import { useState } from "react"
import { Menu, Eye } from "lucide-react"
import { Sidebar } from "./Sidebar"

interface ImpersonationContext {
  employeeId: string
  employeeName: string
}

interface AppShellProps {
  children: React.ReactNode
  userInitials: string
  userName: string
  roleBadge: string
  isHR: boolean
  ownEmployeeId: string | null
  ownEmployeeName: string
  impersonating: ImpersonationContext | null
  signOutAction: () => Promise<void>
}

async function apiSetImpersonation(employeeId: string, employeeName: string) {
  await fetch("/api/impersonate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeId, employeeName }),
  })
  window.location.href = `/employees/${employeeId}`
}

async function apiClearImpersonation() {
  await fetch("/api/impersonate", { method: "DELETE" })
  window.location.href = "/employees"
}

export function AppShell({
  children,
  userInitials,
  userName,
  roleBadge,
  isHR,
  ownEmployeeId,
  ownEmployeeName,
  impersonating,
  signOutAction,
}: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        roleBadge={roleBadge}
        isHR={isHR}
        isImpersonating={!!impersonating}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <header
          className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-4 lg:px-6"
          style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.06)" }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="ml-auto flex items-center gap-2 relative">
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold select-none"
                aria-label="User menu"
                aria-expanded={userMenuOpen}
              >
                {userInitials}
              </button>

              {userMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setUserMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 z-20 w-56 rounded-lg border border-border bg-card shadow-lg py-1">
                    <div className="px-3 py-2.5 border-b border-border">
                      <p className="text-sm font-medium text-foreground truncate">
                        {userName}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {roleBadge}
                      </p>
                    </div>

                    {isHR && ownEmployeeId && !impersonating && (
                      <button
                        type="button"
                        onClick={() => {
                          setUserMenuOpen(false)
                          apiSetImpersonation(ownEmployeeId, ownEmployeeName)
                        }}
                        className="w-full px-3 py-2 text-sm text-left text-foreground hover:bg-muted transition-colors flex items-center gap-2"
                      >
                        <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                        View as Staff
                      </button>
                    )}

                    {impersonating && (
                      <button
                        type="button"
                        onClick={() => {
                          setUserMenuOpen(false)
                          apiClearImpersonation()
                        }}
                        className="w-full px-3 py-2 text-sm text-left text-amber-700 hover:bg-amber-50 transition-colors flex items-center gap-2"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Exit Staff View
                      </button>
                    )}

                    <form action={signOutAction}>
                      <button
                        type="submit"
                        className="w-full px-3 py-2 text-sm text-left text-foreground hover:bg-muted transition-colors"
                      >
                        Sign out
                      </button>
                    </form>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Impersonation banner */}
        {impersonating && (
          <div className="shrink-0 flex items-center justify-between gap-3 bg-amber-50 border-b border-amber-200 px-4 lg:px-6 py-2">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-amber-600 shrink-0" />
              <span className="text-sm text-amber-800 font-medium">
                Viewing as{" "}
                <span className="font-semibold">{impersonating.employeeName}</span>
                <span className="font-normal text-amber-700"> — Staff view</span>
              </span>
            </div>
            <button
              type="button"
              onClick={apiClearImpersonation}
              className="text-xs font-semibold text-amber-700 hover:text-amber-900 border border-amber-300 rounded-md px-2.5 py-1 hover:bg-amber-100 transition-colors"
            >
              Exit
            </button>
          </div>
        )}

        {/* Scrollable content area */}
        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-5 lg:px-7 lg:py-6">
          {children}
        </main>
      </div>
    </div>
  )
}
