import { updateSession } from '@/lib/supabase/proxy'
import { type NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  // Skip middleware for public routes that don't need auth
  const publicPaths = ['/', '/auth/login', '/auth/sign-up', '/auth/sign-up-success', '/auth/error']
  if (publicPaths.includes(request.nextUrl.pathname)) {
    // Still update session for auth pages (to redirect logged-in users)
    if (request.nextUrl.pathname.startsWith('/auth/')) {
      try {
        return await updateSession(request)
      } catch {
        return NextResponse.next()
      }
    }
    return NextResponse.next()
  }
  
  try {
    return await updateSession(request)
  } catch {
    // If Supabase fails, redirect to login for protected routes
    if (request.nextUrl.pathname.startsWith('/dashboard')) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      return NextResponse.redirect(url)
    }
    return NextResponse.next()
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
