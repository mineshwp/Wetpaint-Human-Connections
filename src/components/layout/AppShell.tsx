"use client"

import { useState } from "react"
import { Menu } from "lucide-react"
import { Sidebar } from "./Sidebar"

interface AppShellProps {
  children: React.ReactNode
  userInitials: string
  userName: string
  roleBadge: string
  signOutAction: () => Promise<void>
}

export function AppShell({
  children,
  userInitials,
  userName,
  roleBadge,
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
                  <div className="absolute right-0 top-full mt-1 z-20 w-52 rounded-lg border border-border bg-card shadow-lg py-1">
                    <div className="px-3 py-2.5 border-b border-border">
                      <p className="text-sm font-medium text-foreground truncate">
                        {userName}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {roleBadge}
                      </p>
                    </div>
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

        {/* Scrollable content area */}
        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-5 lg:px-7 lg:py-6">
          {children}
        </main>
      </div>
    </div>
  )
}
