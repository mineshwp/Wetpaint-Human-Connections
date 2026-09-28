"use client"

import { Printer } from "lucide-react"

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()}
      className="h-9 rounded-lg border border-border bg-card px-3 text-sm hover:bg-muted flex items-center gap-1.5">
      <Printer size={14} /> Print
    </button>
  )
}
