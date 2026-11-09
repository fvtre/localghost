import { NextResponse } from 'next/server'
import { rejectUntrustedLocalMutation } from '@/lib/api-security'

function getBaseUrl(value?: string) {
  const parsed = new URL(value || process.env.OLLAMA_URL || 'http://127.0.0.1:11434')
  const hostname = parsed.hostname.toLowerCase()
  if (parsed.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname) || parsed.port !== '11434' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('Ollama debe usar http://localhost:11434 en este equipo.')
  }
  return parsed.origin
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const response = await fetch(`${getBaseUrl(url.searchParams.get('url') || undefined)}/api/tags`, { signal: AbortSignal.timeout(1800), cache: 'no-store' })
    if (!response.ok) return NextResponse.json({ connected: false, models: [], error: `Ollama respondió ${response.status}` }, { status: 200 })
    const data = await response.json() as { models?: Array<{ name: string; size?: number }> }
    return NextResponse.json({ connected: true, models: data.models || [] })
  } catch {
    return NextResponse.json({ connected: false, models: [], error: 'Ollama no está disponible en localhost:11434' }, { status: 200 })
  }
}

export async function POST(request: Request) {
  const denied = rejectUntrustedLocalMutation(request)
  if (denied) return denied
  try {
    const body = await request.json() as { model?: string; prompt?: string; url?: string }
    if (!body.model || !body.prompt) return NextResponse.json({ error: 'Falta el modelo o el texto de entrada.' }, { status: 400 })
    if (body.model.length > 160 || body.prompt.length > 200_000) return NextResponse.json({ error: 'La solicitud supera el tamaño permitido.' }, { status: 413 })
    const response = await fetch(`${getBaseUrl(body.url)}/api/generate`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: body.model, prompt: body.prompt, stream: false, think: false, options: { num_ctx: 4096, num_predict: 384, temperature: 0.2 } }),
      signal: AbortSignal.timeout(120_000), cache: 'no-store',
    })
    if (!response.ok) return NextResponse.json({ error: `Ollama respondió ${response.status}` }, { status: 502 })
    const result = await response.json() as { response?: string; done_reason?: string }
    const text = result.response?.trim() || ''
    if (result.done_reason === 'length' || text.length < 24) {
      return NextResponse.json({ error: 'Ollama devolvió un resumen incompleto. Prueba de nuevo o selecciona un modelo local más grande.' }, { status: 502 })
    }
    return NextResponse.json({ text })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible conectar con Ollama.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
