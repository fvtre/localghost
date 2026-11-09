import { NextRequest, NextResponse } from 'next/server'
import { rejectUntrustedLocalMutation } from '@/lib/api-security'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const denied = rejectUntrustedLocalMutation(request)
  if (denied) return denied
  if (Number(request.headers.get('content-length') || 0) > 32_768) return NextResponse.json({ error: 'La solicitud supera el tamaño permitido.' }, { status: 413 })
  let input: { refreshToken?: string }
  try { input = await request.json() as typeof input }
  catch { return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 }) }
  if (!input.refreshToken) return NextResponse.json({ error: 'Falta el permiso que se quiere revocar.' }, { status: 400 })
  try {
    const body = new URLSearchParams({ token: input.refreshToken })
    const response = await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body })
    if (!response.ok) return NextResponse.json({ error: 'Google no pudo revocar el permiso remoto.' }, { status: response.status })
    return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } })
  } catch { return NextResponse.json({ error: 'No se pudo contactar a Google para revocar el permiso.' }, { status: 502 }) }
}
