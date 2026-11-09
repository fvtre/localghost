import { NextResponse } from 'next/server'
import { rejectUntrustedLocalMutation } from '@/lib/api-security'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: Request) {
  const denied = rejectUntrustedLocalMutation(request)
  if (denied) return denied
  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > 200 * 1024 * 1024) return NextResponse.json({ error: 'El audio supera el límite local de 200 MB.' }, { status: 413 })
  const baseUrl = (process.env.WHISPER_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
  try {
    const form = await request.formData()
    const audio = form.get('audio')
    const model = form.get('model')?.toString() || 'Systran/faster-whisper-small'
    const language = form.get('language')?.toString() || 'es'
    if (!(audio instanceof File)) return NextResponse.json({ error: 'No se recibió un archivo de audio.' }, { status: 400 })
    const response = await fetch(`${baseUrl}/v1/audio/transcriptions`, {
      method: 'POST',
      headers: {
        'content-type': audio.type || 'audio/webm',
        'x-localghost-model': model,
        'x-localghost-language': language,
        'x-audio-filename': audio.name || 'recording.webm',
      },
      body: audio,
      signal: AbortSignal.timeout(300_000),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      return NextResponse.json({ error: `Whisper local respondió ${response.status}${detail ? `: ${detail.slice(0, 240)}` : ''}` }, { status: 502 })
    }
    const data = await response.json() as { text?: string; segments?: Array<{ start?: number; end?: number; text?: string; speaker?: string }> }
    const segments = (data.segments || []).map((segment) => ({ start: segment.start || 0, end: segment.end || 0, text: segment.text || '', speaker: segment.speaker || 'Micrófono' }))
    return NextResponse.json({ text: data.text || '', segments })
  } catch {
    return NextResponse.json({ error: 'No se pudo conectar con Whisper local. Inicia el servidor compatible en localhost:8000.' }, { status: 502 })
  }
}
