"use client"

import Image from "next/image"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState, useEffect, useRef, useCallback, FormEvent, Suspense } from "react"
import { Eye, EyeOff, LogIn, AlertCircle } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

function LoginForm() {
  const router = useRouter()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: -9999, y: -9999 })

  const startCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext("2d")
    if (!context) return
    const canvasEl = canvas
    const ctx = context

    const SPACING = 34
    const BASE_R = 1.6
    const REPEL_R = 165
    const STRENGTH = 5.5
    const SPRING = 0.062
    const DAMPING = 0.75

    type Dot = { hx: number; hy: number; x: number; y: number; vx: number; vy: number }
    let dots: Dot[] = []
    let raf: number

    function build() {
      canvasEl.width = window.innerWidth
      canvasEl.height = window.innerHeight
      dots = []
      const cols = Math.ceil(canvasEl.width / SPACING) + 1
      const rows = Math.ceil(canvasEl.height / SPACING) + 1
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const hx = c * SPACING
          const hy = r * SPACING
          dots.push({ hx, hy, x: hx, y: hy, vx: 0, vy: 0 })
        }
      }
    }

    function draw() {
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height)
      const mx = mouseRef.current.x
      const my = mouseRef.current.y

      const layers = [
        { r: 520, a0: 0.07, a1: 0 },
        { r: 220, a0: 0.18, a1: 0 },
        { r: 80, a0: 0.32, a1: 0 },
      ]
      for (const l of layers) {
        const g = ctx.createRadialGradient(mx, my, 0, mx, my, l.r)
        g.addColorStop(0, `rgba(227,28,18,${l.a0})`)
        g.addColorStop(1, `rgba(227,28,18,${l.a1})`)
        ctx.fillStyle = g
        ctx.fillRect(0, 0, canvasEl.width, canvasEl.height)
      }

      for (const d of dots) {
        const dx = mx - d.x
        const dy = my - d.y
        const dist = Math.sqrt(dx * dx + dy * dy)

        if (dist < REPEL_R && dist > 0) {
          const force = ((REPEL_R - dist) / REPEL_R) ** 1.6
          d.vx -= (dx / dist) * force * STRENGTH
          d.vy -= (dy / dist) * force * STRENGTH
        }

        d.vx += (d.hx - d.x) * SPRING
        d.vy += (d.hy - d.y) * SPRING
        d.vx *= DAMPING
        d.vy *= DAMPING
        d.x += d.vx
        d.y += d.vy

        const hDist = Math.sqrt((mx - d.hx) ** 2 + (my - d.hy) ** 2)
        const p = Math.max(0, 1 - hDist / (REPEL_R * 1.1))
        const cr = Math.round(188 + p * (227 - 188))
        const cg = Math.round(189 + p * (28 - 189))
        const cb = Math.round(194 + p * (18 - 194))
        const ca = 0.45 + p * 0.55
        const r = BASE_R + p * 1.8

        ctx.beginPath()
        ctx.arc(d.x, d.y, r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${ca})`
        ctx.fill()
      }

      raf = requestAnimationFrame(draw)
    }

    build()
    draw()

    const onResize = () => build()
    window.addEventListener("resize", onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", onResize)
    }
  }, [])

  useEffect(() => {
    const cleanup = startCanvas()
    return cleanup
  }, [startCanvas])

  useEffect(() => {
    function onMove(e: MouseEvent) {
      mouseRef.current = { x: e.clientX, y: e.clientY }
    }
    window.addEventListener("mousemove", onMove)
    return () => window.removeEventListener("mousemove", onMove)
  }, [])

  const searchParams = useSearchParams()
  const isDomainError = searchParams.get("error") === "unauthorized_domain"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(
    isDomainError ? "Access is restricted to @wetpaint.co.za email addresses." : null
  )

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const supabase = createClient()
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })

      if (authError) {
        setError("Invalid email or password.")
        return
      }

      router.push("/employees")
      router.refresh()
    } catch {
      setError("A network error occurred. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const inputCls =
    "h-10 w-full rounded-lg border border-border bg-white px-3.5 text-sm text-foreground " +
    "placeholder:text-muted-foreground outline-none transition-all " +
    "focus:border-[#E31C12]/50 focus:ring-2 focus:ring-[#E31C12]/20"

  return (
    <div
      className="relative min-h-screen flex flex-col overflow-hidden"
      style={{ background: "oklch(0.97 0.003 247)" }}
    >
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
      />

      <div
        className="relative h-1 w-full shrink-0"
        style={{ background: "linear-gradient(90deg, #E31C12 0%, #ff4d44 100%)" }}
      />

      <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-14 sm:py-20">
        <div className="mb-10 flex flex-col items-center gap-4 text-center">
          <div className="relative flex h-[200px] w-[200px] items-center justify-center">
            <Image
              src="/wp-logo.png"
              alt="Wetpaint"
              width={320}
              height={214}
              className="object-contain h-auto w-auto"
              priority
            />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Human Connections
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">Sign in to your workspace</p>
          </div>
        </div>

        <div
          className="w-full max-w-sm rounded-2xl border border-border bg-white p-8"
          style={{ boxShadow: "0 4px 16px 0 rgb(0 0 0 / 0.08), 0 1px 3px 0 rgb(0 0 0 / 0.06)" }}
        >
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {error && (
              <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-xs font-semibold text-foreground">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@wetpaint.co.za"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
                disabled={loading}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="block text-xs font-semibold text-foreground">
                  Password
                </label>
                <Link
                  href="/login/forgot-password"
                  className="text-xs text-[#E31C12] hover:underline"
                  tabIndex={loading ? -1 : 0}
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPwd ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputCls + " pr-10"}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPwd ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold text-white transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: loading ? "#c41a12" : "#E31C12" }}
              onMouseEnter={(e) => {
                if (!loading) (e.currentTarget as HTMLElement).style.background = "#c41a12"
              }}
              onMouseLeave={(e) => {
                if (!loading) (e.currentTarget as HTMLElement).style.background = "#E31C12"
              }}
            >
              {loading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground/70 max-w-xs">
          Access is restricted to authorised Wetpaint staff. Contact HR to request an account.
        </p>
      </div>

      <footer className="relative border-t border-border bg-white/60 py-4 text-center text-xs text-muted-foreground backdrop-blur-sm">
        © {new Date().getFullYear()} Wetpaint Advertising (Pty) Ltd · All rights reserved
      </footer>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
