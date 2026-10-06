"use client"

import { useEffect, useRef, useState } from "react"
import { IDLE_LIMIT_MS, IDLE_WARNING_MS } from "@/lib/idle"

const STORAGE_KEY = "hc_last_active"
const EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"] as const

/**
 * Signs the user out after 15 minutes without activity, with a 1-minute warning.
 * Activity is shared across tabs and pinged to the server (see middleware).
 */
export function IdleLogout({ signOutAction }: { signOutAction: () => Promise<void> }) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const lastPing = useRef(0)

  useEffect(() => {
    const now = () => Date.now()
    const read = () => Number(localStorage.getItem(STORAGE_KEY)) || now()
    const mark = () => {
      const t = now()
      try { localStorage.setItem(STORAGE_KEY, String(t)) } catch {}
      if (t - lastPing.current > 60_000) {
        lastPing.current = t
        fetch("/api/auth/touch", { method: "POST", keepalive: true }).catch(() => {})
      }
    }
    mark()

    let warning = false
    const onActivity = () => { if (!warning) mark() }
    EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))

    const tick = setInterval(() => {
      const idle = now() - read()
      if (idle >= IDLE_LIMIT_MS) {
        clearInterval(tick)
        signOutAction()
      } else if (idle >= IDLE_LIMIT_MS - IDLE_WARNING_MS) {
        warning = true
        setSecondsLeft(Math.ceil((IDLE_LIMIT_MS - idle) / 1000))
      } else {
        warning = false
        setSecondsLeft(null)
      }
    }, 1000)

    // Another tab became active again.
    const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) { warning = false; setSecondsLeft(null) } }
    window.addEventListener("storage", onStorage)

    return () => {
      clearInterval(tick)
      EVENTS.forEach((e) => window.removeEventListener(e, onActivity))
      window.removeEventListener("storage", onStorage)
    }
  }, [signOutAction])

  if (secondsLeft === null) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-base font-semibold text-foreground">Still there?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          For your security you&apos;ll be signed out in {secondsLeft} second{secondsLeft === 1 ? "" : "s"} due to inactivity.
        </p>
        <button
          type="button"
          autoFocus
          onClick={() => {
            try { localStorage.setItem(STORAGE_KEY, String(Date.now())) } catch {}
            fetch("/api/auth/touch", { method: "POST" }).catch(() => {})
            setSecondsLeft(null)
          }}
          className="mt-5 h-9 w-full rounded-lg bg-[#E31C12] text-sm font-semibold text-white hover:bg-[#c41a12]"
        >
          Stay signed in
        </button>
      </div>
    </div>
  )
}
