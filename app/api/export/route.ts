import { NextResponse } from 'next/server'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin')
    if (!origin || new URL(origin).origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Solicitud de origen no permitido.' }, { status: 403 })
    const host = new URL(request.url).hostname
    if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(host)) return NextResponse.json({ error: 'La exportación directa solo está habilitada al ejecutar LocalGhost en este equipo.' }, { status: 403 })
    const body = await request.json() as { path?: string; filename?: string; content?: string }
    if (!body.path || !body.filename || typeof body.content !== 'string') return NextResponse.json({ error: 'Completa la ruta, nombre y contenido de la nota.' }, { status: 400 })
    if (body.content.length > 5_000_000) return NextResponse.json({ error: 'La nota supera el máximo de 5 MB.' }, { status: 413 })
    if (!path.isAbsolute(body.path)) return NextResponse.json({ error: 'La ruta del vault debe ser absoluta.' }, { status: 400 })
    const filename = path.basename(body.filename).replace(/[<>:"/\\|?*]/g, '-')
    if (!filename.toLowerCase().endsWith('.md')) return NextResponse.json({ error: 'Solo se pueden exportar notas Markdown (.md).' }, { status: 400 })
    await mkdir(body.path, { recursive: true })
    const destination = path.join(body.path, filename)
    await writeFile(destination, body.content, { encoding: 'utf8', flag: 'w' })
    return NextResponse.json({ path: destination })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo escribir en la ruta indicada.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
