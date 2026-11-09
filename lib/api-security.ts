export function isTrustedLocalMutation(request: Request): boolean {
  try {
    const url = new URL(request.url)
    const host = url.hostname.toLowerCase()
    if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(host)) return false

    const origin = request.headers.get('origin')
    return !!origin && new URL(origin).origin === url.origin
  } catch {
    return false
  }
}

export function rejectUntrustedLocalMutation(request: Request): Response | null {
  return isTrustedLocalMutation(request)
    ? null
    : Response.json({ error: 'Solicitud local no permitida.' }, { status: 403 })
}
