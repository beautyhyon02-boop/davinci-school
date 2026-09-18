import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { homePathFor, requiredRoleFor, type Role } from '@/lib/auth/roles'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname
  const need = requiredRoleFor(pathname)

  if (need) {
    if (!user) {
      const url = request.nextUrl.clone(); url.pathname = '/login'; url.searchParams.set('next', pathname)
      return NextResponse.redirect(url)
    }
    const role = user.app_metadata?.role as Role | undefined
    if (role !== need) {
      const url = request.nextUrl.clone(); url.pathname = role ? homePathFor(role) : '/login'; url.search = ''
      return NextResponse.redirect(url)
    }
  }
  if (pathname === '/login' && user) {
    const role = user.app_metadata?.role as Role | undefined
    if (role) { const url = request.nextUrl.clone(); url.pathname = homePathFor(role); url.search = ''; return NextResponse.redirect(url) }
  }
  return response
}
