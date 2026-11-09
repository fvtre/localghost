import { NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const isDev = process.env.NODE_ENV === 'development'
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''} https://accounts.google.com`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' blob: data: asset: http://asset.localhost",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    "connect-src 'self' ipc: http://ipc.localhost http://127.0.0.1:8000 http://127.0.0.1:11434 http://localhost:3001 https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', policy)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', policy)
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'no-referrer')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Permissions-Policy', 'camera=(), geolocation=(), payment=()')
  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|localghost-icon.png).*)',
  ],
}
