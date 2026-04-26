import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/admin')) {
    return new NextResponse('Not Found', { status: 404 })
  }
}

export const config = {
  matcher: '/admin/:path*',
}
