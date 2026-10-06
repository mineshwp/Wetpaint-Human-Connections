import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { ACTIVITY_COOKIE, IDLE_LIMIT_MS } from '@/lib/idle'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  const publicPaths = ['/login', '/auth/callback', '/api/auth/signout-domain-error', '/api/auth/forgot-password', '/api/cron/keepalive']
  const isPublic = publicPaths.some((p) => pathname.startsWith(p))

  // Inactivity timeout. Page loads and /api/auth/touch (sent by the browser on real
  // activity) refresh the cookie; other API calls and prefetches do not, so a tab
  // left open can't keep the session alive.
  const activityOpts = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' }
  if (pathname.startsWith('/login')) {
    supabaseResponse.cookies.delete(ACTIVITY_COOKIE)
  } else if (user && !isPublic) {
    const last = Number(request.cookies.get(ACTIVITY_COOKIE)?.value)
    if (last && Date.now() - last > IDLE_LIMIT_MS) {
      await supabase.auth.signOut()
      const isApi = pathname.startsWith('/api/')
      const res = isApi
        ? NextResponse.json({ error: 'Session expired' }, { status: 401 })
        : NextResponse.redirect(new URL('/login', request.url))
      supabaseResponse.cookies.getAll().forEach((c) => res.cookies.set(c))
      res.cookies.delete(ACTIVITY_COOKIE)
      return res
    }
    const isPrefetch =
      request.headers.has('next-router-prefetch') || request.headers.get('purpose') === 'prefetch'
    const refreshes = pathname === '/api/auth/touch' || (!pathname.startsWith('/api/') && !isPrefetch)
    if (refreshes || !last) {
      supabaseResponse.cookies.set(ACTIVITY_COOKIE, String(Date.now()), activityOpts)
    }
  }

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Block non-wetpaint.co.za accounts from accessing protected routes
  if (user && !isPublic) {
    const email = user.email ?? ''
    if (!email.endsWith('@wetpaint.co.za')) {
      const url = request.nextUrl.clone()
      url.pathname = '/api/auth/signout-domain-error'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
