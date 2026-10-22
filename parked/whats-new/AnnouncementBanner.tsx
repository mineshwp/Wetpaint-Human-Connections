"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Sparkles, X } from "lucide-react"

/** Slim bar under the top bar for the newest announcement you haven't opened. */
export function AnnouncementBanner({ latest }: { latest: { id: string; title: string } | null }) {
  const pathname = usePathname()
  const router = useRouter()
  const [dismissed, setDismissed] = useState<string | null>(null)
  if (!latest || dismissed === latest.id || pathname.startsWith("/updates")) return null

  return (
    <div role="status" className="flex items-center gap-3 border-b border-primary/20 bg-primary/10 px-4 py-2 text-sm lg:px-6">
      <Sparkles className="h-4 w-4 shrink-0 text-primary" />
      <p className="min-w-0 flex-1 truncate text-foreground"><strong>New:</strong> {latest.title}</p>
      <Link href="/updates" className="shrink-0 font-semibold text-primary hover:underline">Read more</Link>
      <button type="button" aria-label="Dismiss" onClick={() => {
        setDismissed(latest.id)
        fetch("/api/announcements/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: latest.id }) })
          .then(() => router.refresh()).catch(() => {})
      }} className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-primary/10 hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
