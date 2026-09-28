import Link from "next/link"
import { redirect } from "next/navigation"
import { ShieldCheck, Sparkles, UserCog } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"
import { listAdmins } from "@/lib/admins"
import { PageHeader } from "@/components/layout/PageHeader"
import { cn } from "@/lib/utils"
import { AdminsPanel } from "./AdminsPanel"
import { AccessOverview } from "./AccessOverview"
import { AiSettingsPanel } from "./AiSettingsPanel"
import { loadAccessData } from "@/lib/access-overview"

export const metadata = { title: "Settings — Human Connections" }

// Settings sections, one tab each (?tab=<id>). Add new sections here.
const TABS = [
  { id: "admins", label: "Administrators", icon: UserCog },
  { id: "access", label: "Who can see what", icon: ShieldCheck },
  { id: "ai", label: "AI (OpenAI)", icon: Sparkles },
] as const

type TabId = (typeof TABS)[number]["id"]

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") redirect("/employees")

  const { tab: rawTab } = await searchParams
  const tab: TabId = TABS.some((t) => t.id === rawTab) ? (rawTab as TabId) : "admins"

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader title="Settings" />

      <nav className="flex items-center gap-1 border-b border-border overflow-x-auto" aria-label="Settings sections">
        {TABS.map((t) => {
          const Icon = t.icon
          const active = t.id === tab
          return (
            <Link
              key={t.id}
              href={`/settings?tab=${t.id}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors",
                active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon size={15} /> {t.label}
            </Link>
          )
        })}
      </nav>

      {tab === "admins" && <AdminsPanel initialAdmins={await listAdmins()} currentUserId={user.id} />}
      {tab === "access" && <AccessOverview initial={await loadAccessData()} />}
      {tab === "ai" && <AiSettingsPanel />}
    </div>
  )
}
