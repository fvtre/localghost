import { NextRequest, NextResponse } from 'next/server'
import { rejectUntrustedLocalMutation } from '@/lib/api-security'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const denied = rejectUntrustedLocalMutation(request)
  if (denied) return denied
  if (Number(request.headers.get('content-length') || 0) > 32_768) return NextResponse.json({ error: 'La solicitud supera el tamaño permitido.' }, { status: 413 })
  let input: { clientId?: string; clientSecret?: string; code?: string; codeVerifier?: string; redirectUri?: string; refreshToken?: string }
  try { input = await request.json() as typeof input }
  catch { return NextResponse.json({ error: 'Solicitud de autorización inválida.' }, { status: 400 }) }

  if (!input.clientId?.endsWith('.apps.googleusercontent.com')) {
    return NextResponse.json({ error: 'Faltan datos válidos para completar la autorización.' }, { status: 400 })
  }

  const body = input.refreshToken
    ? new URLSearchParams({ client_id: input.clientId, ...(input.clientSecret ? { client_secret: input.clientSecret } : {}), refresh_token: input.refreshToken, grant_type: 'refresh_token' })
    : input.code && input.codeVerifier && input.redirectUri?.startsWith('http://127.0.0.1:')
      ? new URLSearchParams({ client_id: input.clientId, ...(input.clientSecret ? { client_secret: input.clientSecret } : {}), code: input.code, code_verifier: input.codeVerifier, grant_type: 'authorization_code', redirect_uri: input.redirectUri })
      : null
  if (!body) return NextResponse.json({ error: 'Faltan datos válidos para completar la autorización.' }, { status: 400 })
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body })
    const result = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string }
    if (!response.ok || !result.access_token) {
      const description = result.error_description || ''
      const error = /client_secret is missing/i.test(description)
        ? 'Google requiere el client_secret de este cliente OAuth. Pégalo en Ajustes locales y vuelve a conectar.'
        : description || 'Google no entregó un token de calendario.'
      return NextResponse.json({ error }, { status: 400 })
    }
    return NextResponse.json({ accessToken: result.access_token, refreshToken: result.refresh_token, expiresIn: result.expires_in ?? 3600 }, { headers: { 'cache-control': 'no-store' } })
  } catch { return NextResponse.json({ error: 'No se pudo contactar a Google para completar la autorización.' }, { status: 502 }) }
}
