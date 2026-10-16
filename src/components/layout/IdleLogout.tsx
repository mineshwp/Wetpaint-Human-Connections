"use client"

import { useEffect, useRef, useState } from "react"
import { IDLE_LIMIT_MS, IDLE_WARNING_MS } from "@/lib/idle"

const STORAGE_KEY = "hc_last_active"
const EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"] as const

/**
 * Signs the user out after 15 minutes without activity, with a 1-minute warning.
 * Activity is shared across tabs and pinged to the server (see middleware).
 * When the countdown ends the screen is covered straight away (nothing stays
 * readable) and the browser is sent to /login, even if the sign-out call is slow.
 */
export function IdleLogout({ signOutAction }: { signOutAction: () => Promise<void> }) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [expired, setExpired] = useState(false)
  const lastPing = useRef(0)
  const leaving = useRef(false)

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

    async function expire() {
      if (leaving.current) return
      leaving.current = true
      setExpired(true)
      try {
        // Don't wait forever on a slow server: leave after 4 seconds regardless.
        await Promise.race([signOutAction(), new Promise((resolve) => setTimeout(resolve, 4000))])
      } catch {}
      window.location.replace("/login")
    }

    const check = () => {
      const idle = now() - read()
      if (idle >= IDLE_LIMIT_MS) {
        clearInterval(tick)
        void expire()
      } else if (idle >= IDLE_LIMIT_MS - IDLE_WARNING_MS) {
        warning = true
        setSecondsLeft(Math.ceil((IDLE_LIMIT_MS - idle) / 1000))
      } else {
        warning = false
        setSecondsLeft(null)
      }
    }
    const tick = setInterval(check, 1000)
    // Background tabs throttle timers: check again the moment the tab is shown.
    const onVisible = () => { if (document.visibilityState === "visible") check() }
    document.addEventListener("visibilitychange", onVisible)

    // Another tab became active again.
    const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) { warning = false; setSecondsLeft(null) } }
    window.addEventListener("storage", onStorage)

    return () => {
      clearInterval(tick)
      document.removeEventListener("visibilitychange", onVisible)
      EVENTS.forEach((e) => window.removeEventListener(e, onActivity))
      window.removeEventListener("storage", onStorage)
    }
  }, [signOutAction])

  if (expired) {
    return (
      <div role="alertdialog" aria-live="assertive" className="fixed inset-0 z-[200] flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-xl">
          <h2 className="text-base font-semibold text-foreground">You&apos;ve been signed out</h2>
          <p className="mt-2 text-sm text-muted-foreground">For your security, you were signed out due to inactivity. Taking you to the login page…</p>
          <a href="/login" className="mt-5 inline-flex h-9 w-full items-center justify-center rounded-lg bg-[#E31C12] text-sm font-semibold text-white hover:bg-[#c41a12]">
            Go to login now
          </a>
        </div>
      </div>
    )
  }

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
