"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { LogsClient } from "./LogsClient"
import { ErrorsTab } from "./ErrorsTab"

const TABS = [
  { key: "activity", label: "Activity" },
  { key: "errors", label: "Errors" },
] as const

export function LogsTabs({ staff }: { staff: { id: string; name: string }[] }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("activity")

  return (
    <div className="space-y-4">
      <div role="tablist" className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key} type="button" role="tab" aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "activity" ? <LogsClient staff={staff} /> : <ErrorsTab staff={staff} />}
    </div>
  )
}
