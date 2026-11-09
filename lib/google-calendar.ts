import { invoke, isTauri } from '@tauri-apps/api/core'

export type CalendarEvent = {
  id: string
  summary: string
  start: string
  end: string
  url?: string
  meetUrl?: string
}

type GoogleTokenResponse = { access_token?: string; error?: string; error_description?: string }
type GoogleTokenClient = { requestAccessToken: (options?: { prompt?: string }) => void }
type GoogleIdentity = { oauth2: { initTokenClient: (options: { client_id: string; scope: string; callback: (response: GoogleTokenResponse) => void; error_callback?: (error: { message?: string }) => void }) => GoogleTokenClient } }
declare global { interface Window { google?: { accounts?: GoogleIdentity } } }

let identityScript: Promise<void> | undefined

export async function loadCalendarIdentity(): Promise<void> {
  if (window.google?.accounts?.oauth2) return
  identityScript ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => { identityScript = undefined; reject(new Error('No se pudo cargar el inicio de sesión de Google.')) }
    document.head.appendChild(script)
  })
  await identityScript
  if (!window.google?.accounts?.oauth2) throw new Error('Google Identity Services no quedó disponible.')
}

export type CalendarAuthorization = { accessToken: string; expiresIn: number }

export async function authorizeCalendar(clientId: string, clientSecret = ''): Promise<CalendarAuthorization> {
  if (!clientId.trim()) return Promise.reject(new Error('Primero pega el ID de cliente OAuth de Google.'))
  if (isTauri()) return authorizeDesktopCalendar(clientId.trim(), clientSecret.trim())
  if (!window.google?.accounts?.oauth2) return Promise.reject(new Error('Google todavía se está cargando. Inténtalo de nuevo en un momento.'))
  return new Promise((resolve, reject) => {
    const google = window.google?.accounts?.oauth2
    if (!google) return reject(new Error('No se pudo iniciar la autorización de Google.'))
    const client = google.initTokenClient({
      client_id: clientId.trim(),
      scope: 'https://www.googleapis.com/auth/calendar.events.readonly',
      callback: (response) => response.access_token ? resolve({ accessToken: response.access_token, expiresIn: 3600 }) : reject(new Error(response.error_description || response.error || 'Google no entregó autorización.')),
      error_callback: (error) => reject(new Error(error.message || 'Se cerró la ventana de autorización.')),
    })
    client.requestAccessToken({ prompt: 'consent' })
  })
}

async function exchangeCalendarCode(clientId: string, code: string, codeVerifier: string, redirectUri: string, clientSecret = ''): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number }> {
  const response = await fetch('/api/google-calendar/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId, clientSecret, code, codeVerifier, redirectUri }) })
  const result = await response.json() as { accessToken?: string; refreshToken?: string; expiresIn?: number; error?: string }
  if (!response.ok || !result.accessToken) throw new Error(result.error || 'No se pudo completar la autorización de Google.')
  return { accessToken: result.accessToken, refreshToken: result.refreshToken, expiresIn: result.expiresIn ?? 3600 }
}

async function authorizeDesktopCalendar(clientId: string, clientSecret: string): Promise<CalendarAuthorization> {
  if (!clientSecret) throw new Error('Google está pidiendo el client_secret. Pégalo desde los detalles de tu cliente OAuth de escritorio.')
  await invoke('store_calendar_client_secret', { secret: clientSecret })
  const callback = await invoke<{ code: string; code_verifier: string; redirect_uri: string }>('begin_google_calendar_auth', { clientId })
  const result = await exchangeCalendarCode(clientId, callback.code, callback.code_verifier, callback.redirect_uri, clientSecret)
  if (result.refreshToken) await invoke('store_calendar_refresh_token', { token: result.refreshToken })
  return { accessToken: result.accessToken, expiresIn: result.expiresIn }
}

export async function refreshDesktopCalendarAccess(clientId: string): Promise<CalendarAuthorization> {
  const refreshToken = await invoke<string | null>('load_calendar_refresh_token')
  if (!refreshToken) throw new Error('No hay una autorización guardada. Conecta Google Calendar para activar recordatorios.')
  const clientSecret = await invoke<string | null>('load_calendar_client_secret')
  if (!clientSecret) throw new Error('Falta el secreto OAuth cifrado en este equipo. Vuelve a conectar el calendario.')
  const response = await fetch('/api/google-calendar/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId, clientSecret, refreshToken }) })
  const result = await response.json() as { accessToken?: string; expiresIn?: number; error?: string }
  if (!response.ok || !result.accessToken) throw new Error(result.error || 'No se pudo renovar el acceso a Google Calendar.')
  return { accessToken: result.accessToken, expiresIn: result.expiresIn ?? 3600 }
}

export async function clearDesktopCalendarAuthorization(): Promise<void> {
  if (!isTauri()) return
  try {
    const refreshToken = await invoke<string | null>('load_calendar_refresh_token')
    if (refreshToken) await fetch('/api/google-calendar/revoke', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken }) })
  } finally { await Promise.all([invoke('clear_calendar_refresh_token'), invoke('clear_calendar_client_secret')]) }
}

export async function fetchUpcomingEvents(token: string): Promise<CalendarEvent[]> {
  const now = new Date()
  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
  url.searchParams.set('timeMin', now.toISOString())
  url.searchParams.set('timeMax', new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString())
  url.searchParams.set('maxResults', '15')
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('orderBy', 'startTime')
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) {
    if (response.status === 401) throw new Error('La autorización de Google venció. Vuelve a conectar el calendario.')
    throw new Error(`Google Calendar respondió ${response.status}. Revisa el acceso a la API de Calendar.`)
  }
  const data = await response.json() as { items?: { id?: string; summary?: string; start?: { dateTime?: string }; end?: { dateTime?: string }; htmlLink?: string; hangoutLink?: string }[] }
  return (data.items ?? []).flatMap((event) => {
    const start = event.start?.dateTime
    const end = event.end?.dateTime
    return event.id && start && end ? [{ id: event.id, summary: event.summary || 'Reunión', start, end, url: event.htmlLink, meetUrl: event.hangoutLink }] : []
  })
}

