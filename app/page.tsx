'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import { Activity, Archive, AudioLines, CalendarDays, Check, ChevronDown, CircleStop, Clock3, Code2, Copy, Download, FileText, Gauge, Menu, Mic2, PanelLeftClose, Play, Plus, Search, Settings2, Sparkles, Terminal, Trash2, Upload, X, Zap } from 'lucide-react'
import { deleteAllMeetings, deleteExpiredMeetings, deleteMeeting, downloadText, formatDuration, formatMarkdown, getSettings, listMeetings, saveMeeting, saveSettings, type LocalSettings, type MeetingRecord, type StoredTranscript } from '@/lib/local-db'
import { authorizeCalendar, clearDesktopCalendarAuthorization, fetchUpcomingEvents, loadCalendarIdentity, refreshDesktopCalendarAccess, type CalendarEvent } from '@/lib/google-calendar'

type TranscriptionMode = 'live' | 'after'

function Badge({ children, tone = 'default' }: { children: React.ReactNode; tone?: string }) {
  const tones: Record<string, string> = { cyan: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-300', emerald: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300', amber: 'border-amber-400/20 bg-amber-400/10 text-amber-300', sky: 'border-sky-400/20 bg-sky-400/10 text-sky-300', default: 'border-white/10 bg-white/[0.04] text-zinc-400' }
  return <span className={`inline-flex items-center rounded-md border px-2 py-1 text-[10px] font-medium tracking-wide ${tones[tone] || tones.default}`}>{children}</span>
}

export default function Page() {
  const [meetings, setMeetings] = useState<MeetingRecord[]>([])
  const [selected, setSelected] = useState('')
  const [tab, setTab] = useState('notes')
  const [seconds, setSeconds] = useState(0)
  const [recording, setRecording] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sessionOpen, setSessionOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [recordingError, setRecordingError] = useState('')
  const [transcriptionMode, setTranscriptionMode] = useState<TranscriptionMode>('after')
  const [liveStatus, setLiveStatus] = useState('')
  const [ollama, setOllama] = useState<{ connected: boolean; models: { name: string }[] }>({ connected: false, models: [] })
  const [settings, setSettings] = useState<LocalSettings>({ performanceProfile: 'lite', whisperModel: 'Systran/faster-whisper-small', ollamaModel: 'qwen3:1.7b', ollamaUrl: 'http://127.0.0.1:11434', obsidianPath: '', retentionDays: 0, googleCalendarClientId: '' })
  const [sessionTitle, setSessionTitle] = useState('')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const activeStream = useRef<MediaStream | null>(null)
  const [desktopMode, setDesktopMode] = useState(false)
  const recordingStartedAt = useRef<number | null>(null)
  const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null)
  const [calendarToken, setCalendarToken] = useState('')
  const [calendarTokenExpiresAt, setCalendarTokenExpiresAt] = useState(0)
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [calendarStatus, setCalendarStatus] = useState('')
  const [calendarBusy, setCalendarBusy] = useState(false)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const desktopCapture = useRef(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const liveMode = useRef(false)
  const liveMeeting = useRef<MeetingRecord | null>(null)
  const liveCommittedThrough = useRef(0)
  const liveFailed = useRef(false)
  const liveQueue = useRef<Promise<void>>(Promise.resolve())
  const liveQueueDepth = useRef(0)
  const liveSnapshotBusy = useRef(false)
  const liveTimer = useRef<number | null>(null)
  const liveAudioContext = useRef<AudioContext | null>(null)
  const liveProcessor = useRef<ScriptProcessorNode | null>(null)
  const livePcm = useRef<number[]>([])
  const liveSampleOffset = useRef(0)
  const selectedMeeting = meetings.find((item) => item.id === selected) || meetings[0]
  const showToast = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 3500) }
  const refreshMeetings = useCallback(async () => {
    const saved = await listMeetings()
    setMeetings(saved)
    setSelected((current) => saved.some((item) => item.id === current) ? current : saved[0]?.id || '')
  }, [])

  useEffect(() => {
    let active = true
    void (async () => {
      const value = await getSettings()
      if (!active) return
      setSettings(value)
      const expired = await deleteExpiredMeetings(value.retentionDays)
      if (!active) return
      await refreshMeetings()
      if (expired) showToast(`Reuniones antiguas eliminadas: ${expired}.`)
      void fetch(`/api/ollama?url=${encodeURIComponent(value.ollamaUrl)}`).then((r) => r.json()).then(setOllama).catch(() => setOllama({ connected: false, models: [] }))
    })()
    return () => { active = false }
  }, [refreshMeetings])
  useEffect(() => {
    const cleanupExpired = async () => {
      const currentSettings = await getSettings()
      const expired = await deleteExpiredMeetings(currentSettings.retentionDays)
      if (expired) { await refreshMeetings(); showToast(`Reuniones antiguas eliminadas: ${expired}.`) }
    }
    const interval = window.setInterval(() => { void cleanupExpired() }, 60 * 60 * 1000)
    window.addEventListener('focus', cleanupExpired)
    return () => { window.clearInterval(interval); window.removeEventListener('focus', cleanupExpired) }
  }, [refreshMeetings])
  useEffect(() => { setDesktopMode(isTauri()) }, [])
  useEffect(() => {
    if (!desktopMode) return
    let unlisten: (() => void) | undefined
    void listen('ghost-exit-blocked', () => { setToast('Detén y guarda la grabación antes de salir de LocalGhost.'); window.setTimeout(() => setToast(''), 4500) }).then((stop) => { unlisten = stop })
    return () => unlisten?.()
  }, [desktopMode])
  useEffect(() => {
    if (!desktopMode || !settings.googleCalendarClientId) return
    let active = true
    void refreshDesktopCalendarAccess(settings.googleCalendarClientId).then((authorization) => {
      if (active) {
        setCalendarToken(authorization.accessToken); setCalendarTokenExpiresAt(Date.now() + authorization.expiresIn * 1000)
        void isPermissionGranted().then((allowed) => { if (active) setCalendarStatus(allowed ? 'Calendario conectado · avisos activos mientras LocalGhost esté abierto' : 'Calendario conectado · habilita las notificaciones de Windows para recibir avisos.') })
      }
    }).catch((error) => { if (active) setCalendarStatus(readableError(error, 'Conecta Google Calendar para activar los recordatorios.')) })
    return () => { active = false }
  }, [desktopMode, settings.googleCalendarClientId])
  useEffect(() => {
    if (!recording || recordingStartedAt.current === null) return
    const updateElapsed = () => { const startedAt = recordingStartedAt.current; if (startedAt !== null) setSeconds(Math.floor((Date.now() - startedAt) / 1000)) }
    const timer = window.setInterval(updateElapsed, 1000)
    return () => window.clearInterval(timer)
  }, [recording])
  useEffect(() => { const keydown = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen((value) => !value) } if (event.key === 'Escape') { setSearchOpen(false); setSessionOpen(false); setSettingsOpen(false) } }; window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown) }, [])
  useEffect(() => { if (searchOpen) searchRef.current?.focus() }, [searchOpen])
  useEffect(() => () => stream?.getTracks().forEach((track) => track.stop()), [stream])
  useEffect(() => {
    if (!calendarToken) return
    let active = true
    let accessTokenValid = true
    let refreshing = false
    const refresh = async () => {
      if (!accessTokenValid || refreshing) return
      refreshing = true
      try {
        let token = calendarToken
        if (desktopMode && calendarTokenExpiresAt - Date.now() < 5 * 60 * 1000) {
          const authorization = await refreshDesktopCalendarAccess(settings.googleCalendarClientId)
          token = authorization.accessToken
          if (active) { setCalendarToken(token); setCalendarTokenExpiresAt(Date.now() + authorization.expiresIn * 1000) }
        }
        const events = await fetchUpcomingEvents(token)
        if (active) { setCalendarEvents(events); setCalendarStatus('Calendario conectado · avisos activos mientras LocalGhost esté abierto') }
      }
      catch (error) { accessTokenValid = false; if (active) setCalendarStatus(readableError(error, 'No se pudo actualizar el calendario. Los avisos ya programados se mantienen.')) }
      finally { refreshing = false }
    }
    void refresh()
    const interval = window.setInterval(() => { void refresh() }, 3 * 60 * 1000)
    return () => { active = false; window.clearInterval(interval) }
  }, [calendarToken, calendarTokenExpiresAt, desktopMode, settings.googleCalendarClientId])
  useEffect(() => {
    if (!calendarToken) return
    let active = true
    const timers: number[] = []
    void (async () => {
      let granted = false
      try { granted = desktopMode ? await isPermissionGranted() : typeof Notification !== 'undefined' && Notification.permission === 'granted' }
      catch { if (active) setCalendarStatus('Calendario conectado, pero Windows no habilitó los avisos nativos.') ; return }
      if (!granted || !active) return
      for (const event of calendarEvents) {
        const start = Date.parse(event.start)
        const notifyAt = start - 10 * 60 * 1000
        const delay = notifyAt - Date.now()
        const occurrence = `${event.id}:${event.start}`
        if (!Number.isFinite(start) || start <= Date.now() || delay > 24 * 60 * 60 * 1000 || localStorage.getItem(`lg-calendar-reminded:${occurrence}`)) continue
        timers.push(window.setTimeout(() => {
          if (localStorage.getItem(`lg-calendar-reminded:${occurrence}`)) return
          localStorage.setItem(`lg-calendar-reminded:${occurrence}`, '1')
          const minutes = Math.max(1, Math.ceil((start - Date.now()) / 60_000))
          const title = minutes <= 1 ? 'Tu reunión empieza ahora' : `Tu reunión empieza en ${minutes} min`
          const body = event.summary || 'Reunión próxima · LocalGhost está listo para grabar localmente'
          if (desktopMode) void sendNotification({ title, body })
          else if (typeof Notification !== 'undefined') { const notification = new Notification(title, { body, icon: '/localghost-icon.png' }); notification.onclick = () => { window.focus(); if (event.meetUrl || event.url) window.open(event.meetUrl || event.url, '_blank', 'noopener,noreferrer') } }
        }, Math.max(0, delay)))
      }
    })()
    return () => { active = false; timers.forEach(window.clearTimeout) }
  }, [calendarEvents, calendarToken, desktopMode])

  const persist = async (next: MeetingRecord) => { await saveMeeting(next); setMeetings((items) => [next, ...items.filter((item) => item.id !== next.id)]); setSelected(next.id) }
  const patchMeeting = (patch: Partial<MeetingRecord>) => { if (!selectedMeeting) return; void persist({ ...selectedMeeting, ...patch }) }
  const toggleAction = (id: string) => { if (!selectedMeeting) return; void patchMeeting({ actions: selectedMeeting.actions.map((action) => action.id === id ? { ...action, done: !action.done } : action) }) }
  const filteredMeetings = useMemo(() => meetings.filter((item) => `${item.title} ${item.type} ${item.transcript.map((line) => line.text).join(' ')}`.toLowerCase().includes(query.toLowerCase())), [meetings, query])

  const appendLiveTranscript = async (lines: StoredTranscript[]) => {
    const current = liveMeeting.current
    if (!current || !lines.length) return
    const added = lines.filter((line) => !current.transcript.some((existing) => existing.channel === line.channel && normalizeTranscript(existing.text) === normalizeTranscript(line.text) && Math.abs(parseClockSeconds(existing.time) - parseClockSeconds(line.time)) < 1))
    if (!added.length) return
    const next = { ...current, transcript: [...current.transcript, ...added].sort((left, right) => left.time.localeCompare(right.time)) }
    liveMeeting.current = next
    setMeetings((items) => items.map((item) => item.id === next.id ? next : item))
    await saveMeeting(next)
  }

  const queueLiveTranscription = (audio: Blob, channel: StoredTranscript['channel'], speaker: string, offsetSeconds: number, audioDurationSeconds: number) => {
    if (liveFailed.current) return liveQueue.current
    if (liveQueueDepth.current >= 3) {
      liveFailed.current = true
      setLiveStatus('La transcripción se atrasó; al detener se procesará el audio completo.')
      return liveQueue.current
    }
    liveQueueDepth.current++
    liveQueue.current = liveQueue.current.then(async () => {
      if (liveFailed.current) return
      setLiveStatus('Whisper local está escribiendo…')
      try {
        const lines = await transcribeAudio(audio, settings, channel, speaker, offsetSeconds)
        const threshold = Math.max(0, liveCommittedThrough.current - 1)
        await appendLiveTranscript(lines.filter((line) => parseClockSeconds(line.time) >= threshold))
        liveCommittedThrough.current = Math.max(liveCommittedThrough.current, offsetSeconds + Math.max(0, audioDurationSeconds - 4))
        setLiveStatus('Transcripción local en vivo · puede llevar unos segundos de retraso')
      } catch (error) {
        liveFailed.current = true
        setLiveStatus('Whisper tuvo un problema; se intentará transcribir el audio completo al detener.')
        showToast(error instanceof Error ? error.message : 'Falló un fragmento de la transcripción en vivo.')
      }
    }).finally(() => { liveQueueDepth.current = Math.max(0, liveQueueDepth.current - 1) })
    return liveQueue.current
  }

  const transcribeDesktopSnapshot = async () => {
    if (!desktopCapture.current || liveSnapshotBusy.current || liveFailed.current) return
    liveSnapshotBusy.current = true
    try {
      const snapshot = await invoke<{ audio: string; startSeconds: number; durationSeconds: number }>('snapshot_capture')
      if (snapshot.durationSeconds < 2) return
      if (snapshot.startSeconds > liveCommittedThrough.current + 0.5) {
        liveFailed.current = true
        setLiveStatus('Whisper se atrasó; al detener se procesará el audio completo.')
        return
      }
      const binary = atob(snapshot.audio)
      const bytes = new Uint8Array(binary.length)
      for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
      const tracks = await splitStereoPcmWav(new Blob([bytes], { type: 'audio/wav' }))
      if (!tracks) return
      const sources = [
        { audio: tracks[0], channel: 'mic' as const, speaker: 'Micrófono' },
        { audio: tracks[1], channel: 'system' as const, speaker: 'Sistema' },
      ]
      await Promise.all(sources.map(async (source) => {
        const lines = await transcribeAudio(source.audio, settings, source.channel, source.speaker, snapshot.startSeconds)
        const threshold = Math.max(0, liveCommittedThrough.current - 1)
        await appendLiveTranscript(lines.filter((line) => parseClockSeconds(line.time) >= threshold))
      }))
      liveCommittedThrough.current = Math.max(liveCommittedThrough.current, snapshot.startSeconds + snapshot.durationSeconds - 5)
      setLiveStatus('Transcripción local en vivo · puede llevar unos segundos de retraso')
    } catch (error) {
      liveFailed.current = true
      setLiveStatus('Whisper tuvo un problema; se intentará transcribir el audio completo al detener.')
      showToast(error instanceof Error ? error.message : 'Falló un fragmento de la transcripción en vivo.')
    } finally { liveSnapshotBusy.current = false }
  }

  const startBrowserLiveTranscription = async (media: MediaStream, context: AudioContext) => {
    await context.resume()
    if (context.state !== 'running') throw new Error('El navegador no activó el audio necesario para la transcripción en vivo.')
    const source = context.createMediaStreamSource(media)
    const processor = context.createScriptProcessor(4096, 1, 1)
    const muted = context.createGain()
    muted.gain.value = 0
    livePcm.current = []
    liveSampleOffset.current = 0
    liveAudioContext.current = context
    liveProcessor.current = processor
    processor.onaudioprocess = (event) => {
      if (liveFailed.current) { livePcm.current = []; return }
      const input = event.inputBuffer.getChannelData(0)
      for (let index = 0; index < input.length; index++) livePcm.current.push(input[index])
      const windowSize = context.sampleRate * 12
      const stepSize = context.sampleRate * 8
      while (livePcm.current.length >= windowSize) {
        const window = livePcm.current.slice(0, windowSize)
        livePcm.current = livePcm.current.slice(stepSize)
        const start = liveSampleOffset.current / context.sampleRate
        liveSampleOffset.current += stepSize
        void queueLiveTranscription(wavMono(window, context.sampleRate), 'mic', 'Micrófono', start, windowSize / context.sampleRate)
      }
    }
    source.connect(processor)
    processor.connect(muted)
    muted.connect(context.destination)
    setLiveStatus('Esperando el primer fragmento de audio…')
  }

  const finishBrowserLiveTranscription = async () => {
    liveProcessor.current?.disconnect()
    liveProcessor.current = null
    const context = liveAudioContext.current
    if (context && livePcm.current.length > context.sampleRate * 2) {
      const start = liveSampleOffset.current / context.sampleRate
      void queueLiveTranscription(wavMono(livePcm.current, context.sampleRate), 'mic', 'Micrófono', start, livePcm.current.length / context.sampleRate)
    }
    livePcm.current = []
    await liveQueue.current
    if (context) await context.close().catch(() => {})
    liveAudioContext.current = null
  }

  const startCapture = async (meeting: MeetingRecord, mode: TranscriptionMode) => {
    setRecordingError('')
    let browserContext: AudioContext | null = null
    liveMode.current = mode === 'live'
    liveMeeting.current = meeting
    liveCommittedThrough.current = 0
    liveFailed.current = false
    liveQueue.current = Promise.resolve()
    liveQueueDepth.current = 0
    liveSnapshotBusy.current = false
    setLiveStatus(mode === 'live' ? 'Preparando transcripción local…' : '')
    try {
      if (mode === 'live' && !isTauri()) {
        browserContext = new AudioContext()
        void browserContext.resume().catch(() => {})
      }
      if (isTauri()) {
        await invoke('start_capture')
        desktopCapture.current = true
        recordingStartedAt.current = Date.now()
        setRecordedAudio(null); setSeconds(0); setRecording(true); setSessionOpen(false)
        if (mode === 'live') {
          setTab('transcript')
          liveTimer.current = window.setInterval(() => { void transcribeDesktopSnapshot() }, 8000)
          setLiveStatus('Escuchando · la primera transcripción puede tardar unos segundos')
        }
        return
      }
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      activeStream.current = media
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type))
      const mediaRecorder = new MediaRecorder(media, mimeType ? { mimeType } : undefined)
      chunks.current = []
      mediaRecorder.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data) }
      mediaRecorder.onstop = () => setRecordedAudio(new Blob(chunks.current, { type: mediaRecorder.mimeType || 'audio/webm' }))
      mediaRecorder.start(1000)
      recorder.current = mediaRecorder; recordingStartedAt.current = Date.now(); setStream(media); setSeconds(0); setRecording(true); setSessionOpen(false)
      if (mode === 'live') {
        setTab('transcript')
        if (!browserContext) throw new Error('No se pudo preparar el audio para la transcripción en vivo.')
        await startBrowserLiveTranscription(media, browserContext)
      }
    } catch (error) { if (browserContext && browserContext !== liveAudioContext.current) await browserContext.close().catch(() => {}); setRecordingError(error instanceof Error ? error.message : 'No se pudo iniciar la captura de audio.'); await stopCapture() }
  }
  const stopCapture = async () => {
    if (recordingStartedAt.current !== null) setSeconds(Math.floor((Date.now() - recordingStartedAt.current) / 1000))
    recordingStartedAt.current = null
    if (liveMode.current) {
      setLiveStatus('Procesando los últimos segundos de audio…')
      if (liveTimer.current !== null) { window.clearInterval(liveTimer.current); liveTimer.current = null }
      if (desktopCapture.current) {
        while (liveSnapshotBusy.current) await new Promise((resolve) => window.setTimeout(resolve, 100))
        await transcribeDesktopSnapshot()
      }
      else await finishBrowserLiveTranscription()
      await liveQueue.current
      if (!liveFailed.current) setLiveStatus('Captura detenida · transcripción guardada localmente')
    }
    if (desktopCapture.current) {
      try {
        const encoded = await invoke<string>('stop_capture')
        const binary = atob(encoded)
        const bytes = new Uint8Array(binary.length)
        for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
        setRecordedAudio(new Blob([bytes], { type: 'audio/wav' }))
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo finalizar la captura WASAPI.'
        setRecordingError(message); showToast(message)
      } finally {
        desktopCapture.current = false
        setRecording(false)
      }
      return
    }
    if (recorder.current?.state === 'recording') recorder.current.stop()
    activeStream.current?.getTracks().forEach((track) => track.stop()); activeStream.current = null; setStream(null); setRecording(false)
  }
  const finishSession = async (transcribe = true) => {
    if (!recordedAudio || !selectedMeeting) return
    setBusy(true)
    let draftSaved = false
    let transcriptionSucceeded = !transcribe
    try {
      const baseMeeting = liveMeeting.current?.id === selectedMeeting.id ? liveMeeting.current : selectedMeeting
      const draft: MeetingRecord = { ...baseMeeting, title: sessionTitle.trim() || baseMeeting.title, durationSeconds: seconds, audio: recordedAudio }
      // Save the recording before local models run so a slow/failing Whisper cannot lose it.
      liveMeeting.current = draft
      await persist(draft)
      draftSaved = true
      showToast('Audio guardado localmente. Procesando transcripciÃ³nâ€¦')
      let transcript: StoredTranscript[] = transcribe && liveMode.current && !liveFailed.current ? [...baseMeeting.transcript] : []
      if (transcribe && liveMode.current && !liveFailed.current) transcriptionSucceeded = true
      if (transcribe && (!liveMode.current || liveFailed.current)) {
        try {
          const tracks = await splitStereoPcmWav(recordedAudio)
          const sources = tracks ? [{ audio: tracks[0], channel: 'mic' as const, speaker: 'Micrófono' }, { audio: tracks[1], channel: 'system' as const, speaker: 'Sistema' }] : [{ audio: recordedAudio, channel: 'mic' as const, speaker: 'Micrófono' }]
          const results = await Promise.all(sources.map((source) => transcribeAudio(source.audio, settings, source.channel, source.speaker)))
          transcript = results.flat().sort((left, right) => left.time.localeCompare(right.time))
          transcriptionSucceeded = true
        } catch (error) { showToast(`Audio guardado; ${error instanceof Error ? error.message : 'Whisper no pudo transcribirlo.'}`) }
      }
      let summary = baseMeeting.summary
      if (transcribe && transcript.length && ollama.connected) {
        try {
          const response = await fetch('/api/ollama', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: settings.ollamaModel, url: settings.ollamaUrl, prompt: `Resume esta reunión en español en 2-3 frases. Solo usa el contenido dado.\n\n${transcript.map((line) => line.text).join('\n')}` }) })
          const data = await response.json(); if (!response.ok) throw new Error(data.error); summary = data.text
        } catch { showToast('Transcripción lista; Ollama no pudo generar el resumen.') }
      }
      const next: MeetingRecord = { ...baseMeeting, title: sessionTitle.trim() || baseMeeting.title, createdAt: new Date().toISOString(), durationSeconds: seconds, audio: recordedAudio, transcript, summary }
      liveMeeting.current = next
      await persist(next); if (transcriptionSucceeded) setRecordedAudio(null); if (transcribe) setTab('transcript'); showToast(transcriptionSucceeded ? (transcribe ? 'Reunión guardada en este dispositivo.' : 'Audio y reunión guardados en este dispositivo.') : 'Audio guardado. Puedes reintentar la transcripción cuando Whisper esté disponible.')
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Error desconocido.'
      showToast(draftSaved ? `La reuniÃ³n quedÃ³ guardada, pero hubo un error: ${detail}` : `No se pudo guardar la reuniÃ³n: ${detail}`)
    } finally { setBusy(false) }
  }
  const createMeeting = async (mode: TranscriptionMode) => {
    const next: MeetingRecord = { id: crypto.randomUUID(), title: sessionTitle.trim() || 'Nueva reunión', type: 'Reunión local', createdAt: new Date().toISOString(), durationSeconds: 0, transcript: [], actions: [], summary: '', tags: ['reuniones', 'local-first'] }
    const capture = startCapture(next, mode)
    await persist(next); setSeconds(0); setRecordedAudio(null); await capture
  }
  const exportMarkdown = (meeting: MeetingRecord) => { downloadText(`${slug(meeting.title)}.md`, formatMarkdown(meeting)); showToast('Markdown descargado.') }
  const exportTranscriptText = (meeting: MeetingRecord) => { downloadText(`${slug(meeting.title)}-transcripcion.txt`, meeting.transcript.map((line) => `[${line.time}] ${line.speaker}: ${line.text}`).join('\n')); showToast('Transcripción TXT descargada.') }
  const exportAudio = (meeting: MeetingRecord) => {
    if (!meeting.audio) { showToast('Esta reunión no tiene audio guardado.'); return }
    const url = URL.createObjectURL(meeting.audio)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${slug(meeting.title)}.${meeting.audio.type === 'audio/wav' ? 'wav' : 'webm'}`
    anchor.click()
    URL.revokeObjectURL(url)
    showToast('Audio descargado.')
  }
  const copyMarkdown = async () => { if (!selectedMeeting) return; await navigator.clipboard.writeText(formatMarkdown(selectedMeeting)); setCopied(true); window.setTimeout(() => setCopied(false), 1800) }
  const exportObsidian = async (): Promise<boolean> => {
    if (!selectedMeeting) return false
    if (!settings.obsidianPath.trim()) { showToast('Configura la ruta local del vault de Obsidian en Ajustes.'); setSettingsOpen(true); return false }
    try { const response = await fetch('/api/export', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: settings.obsidianPath, filename: `${slug(selectedMeeting.title)}.md`, content: formatMarkdown(selectedMeeting) }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); showToast('Nota exportada a Obsidian.') } catch (error) { showToast(error instanceof Error ? error.message : 'Falló la exportación.') }
    return true
  }
  const openInObsidian = async () => {
    if (!selectedMeeting || !settings.obsidianPath.trim()) { showToast('Configura primero la ruta del vault de Obsidian.'); setSettingsOpen(true); return }
    if (!await exportObsidian()) return
    const vault = settings.obsidianPath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'Obsidian'
    window.location.href = `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(`${slug(selectedMeeting.title)}.md`)}`
  }
  const removeMeeting = async (meeting: MeetingRecord) => { if (!window.confirm(`¿Eliminar “${meeting.title}” y su audio guardado de este dispositivo?`)) return; await deleteMeeting(meeting.id); await refreshMeetings(); showToast('Reunión eliminada.') }
  const clearAllLocalMeetings = async () => {
    if (!window.confirm('¿Eliminar todas las reuniones, transcripciones y audios guardados en este equipo? Esta acción no se puede deshacer.')) return
    await deleteAllMeetings(); setMeetings([]); setSelected(''); showToast('Se eliminaron todas las reuniones y sus audios locales.')
  }
  const saveLocalSettings = async (next: LocalSettings) => {
    setSettings(next); await saveSettings(next)
    const expired = await deleteExpiredMeetings(next.retentionDays)
    if (expired) { await refreshMeetings(); showToast(`Reuniones antiguas eliminadas: ${expired}.`) }
  }
  const connectCalendar = async (clientId: string, clientSecret: string) => {
    setCalendarBusy(true); setCalendarStatus('Solicitando permiso de solo lectura…')
    try {
      let notificationsAllowed = !desktopMode
      if (desktopMode) {
        try {
          const allowed = await isPermissionGranted()
          notificationsAllowed = allowed || await requestPermission() === 'granted'
        } catch { notificationsAllowed = false }
      }
      const authorization = authorizeCalendar(clientId, clientSecret)
      const authorized = await authorization
      const nextSettings = { ...settings, googleCalendarClientId: clientId.trim() }
      setSettings(nextSettings)
      await saveSettings(nextSettings)
      if (!desktopMode && typeof Notification !== 'undefined' && Notification.permission === 'default') await Notification.requestPermission()
      const events = await fetchUpcomingEvents(authorized.accessToken)
      setCalendarToken(authorized.accessToken); setCalendarTokenExpiresAt(Date.now() + authorized.expiresIn * 1000); setCalendarEvents(events); setCalendarStatus(notificationsAllowed ? 'Calendario conectado · avisos activos mientras LocalGhost esté abierto' : 'Calendario conectado · habilita las notificaciones de Windows para recibir avisos.')
      showToast(`Google Calendar conectado: ${events.length} reunión(es) próximas.`)
    } catch (error) { setCalendarStatus(readableError(error, 'No se pudo conectar Google Calendar.')) }
    finally { setCalendarBusy(false) }
  }
  const disconnectCalendar = () => { setCalendarToken(''); setCalendarTokenExpiresAt(0); setCalendarEvents([]); void clearDesktopCalendarAuthorization(); setCalendarStatus('Calendario desconectado.') }

  if (!selectedMeeting) return <main className="flex min-h-screen flex-col items-center justify-center bg-[#09090b] px-6 text-center text-zinc-100"><img src="/localghost-icon.png" alt="LocalGhost" className="mb-6 size-20" /><h1 className="text-lg font-semibold">No hay reuniones guardadas</h1><p className="mt-2 max-w-sm text-xs leading-6 text-zinc-500">Crea una sesión para empezar. Tus notas y audios permanecerán en este equipo.</p><div className="mt-6 flex gap-3"><button onClick={() => { setSessionTitle(''); setSessionOpen(true) }} className="rounded-md bg-cyan-600 px-4 py-2.5 text-xs font-semibold text-white">Nueva sesión</button><button onClick={() => setSettingsOpen(true)} className="rounded-md border border-white/10 px-4 py-2.5 text-xs text-zinc-300">Ajustes locales</button></div>{settingsOpen && <SettingsDrawer settings={settings} ollama={ollama} desktopMode={desktopMode} onSave={saveLocalSettings} onExport={exportObsidian} onDeleteAll={clearAllLocalMeetings} onConnectCalendar={connectCalendar} onDisconnectCalendar={disconnectCalendar} calendarStatus={calendarStatus} calendarEvents={calendarEvents} calendarConnected={Boolean(calendarToken)} calendarBusy={calendarBusy} onClose={() => setSettingsOpen(false)} />}{sessionOpen && <SessionModal title={sessionTitle} setTitle={setSessionTitle} error={recordingError} desktopMode={desktopMode} transcriptionMode={transcriptionMode} setTranscriptionMode={setTranscriptionMode} onClose={() => setSessionOpen(false)} onCreate={() => void createMeeting(transcriptionMode)} />}{toast && <div role="status" className="fixed bottom-5 left-1/2 z-[70] -translate-x-1/2 rounded-lg border border-white/10 bg-zinc-900 px-4 py-3 text-xs text-zinc-200 shadow-xl">{toast}</div>}</main>
  return (
    <main className="min-h-screen bg-[#09090b] text-zinc-100 selection:bg-cyan-500/30">
      <div className="flex min-h-screen">
        <aside className={`${sidebarOpen ? 'w-[284px]' : 'w-0'} shrink-0 overflow-hidden border-r border-white/[0.07] bg-[#0d0d10] transition-all duration-300`}><div className="flex h-full min-w-[284px] flex-col">
          <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-4"><div className="flex items-center gap-2.5"><img src="/localghost-icon.png" alt="" className="size-8" /><div><div className="text-[13px] font-semibold tracking-tight">Local<span className="text-cyan-400">Ghost</span></div><div className="font-mono text-[9px] text-zinc-600">ZERO FOOTPRINT · ZERO BOTS</div></div></div><button aria-label="Contraer barra lateral" onClick={() => setSidebarOpen(false)} className="rounded-md p-1.5 text-zinc-600 hover:bg-white/5 hover:text-zinc-300"><PanelLeftClose className="size-4" /></button></div>
          <div className="p-3"><button onClick={() => recording ? void stopCapture() : setSessionOpen(true)} className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-lg border px-3 py-3 text-left transition-all ${recording ? 'border-rose-400/30 bg-rose-400/[0.08]' : 'border-cyan-400/20 bg-cyan-500/[0.08] hover:border-cyan-400/40'}`}>{recording && <span className="absolute inset-0 animate-pulse bg-rose-400/[0.04]" />}<span className={`relative flex size-8 items-center justify-center rounded-md ${recording ? 'bg-rose-400/15 text-rose-300' : 'bg-cyan-400/15 text-cyan-300'}`}>{recording ? <CircleStop className="size-4" /> : <Mic2 className="size-4" />}</span><span className="relative flex-1"><span className="block text-[12px] font-semibold">{recording ? 'Grabación activa' : 'Iniciar Ghost Mode'}</span><span className={`font-mono text-[10px] ${recording ? 'text-rose-300' : 'text-zinc-500'}`}>{recording ? `${formatDuration(seconds)} · ${desktopMode ? 'micrófono + sistema' : 'micrófono local'}` : `Captura local · ${desktopMode ? 'WASAPI estéreo' : 'sin bots'}`}</span></span><Zap className={`relative size-3.5 ${recording ? 'text-rose-300' : 'text-cyan-300'}`} /></button>{recording && <button onClick={() => void stopCapture()} className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-rose-400/20 bg-rose-400/10 py-2 text-[10px] font-semibold text-rose-300"><CircleStop className="size-3" /> Detener captura</button>}</div>
          {desktopMode && <p className="px-4 pb-3 text-[9px] leading-4 text-zinc-600">Cerrar esta ventana la oculta; LocalGhost sigue activo junto al reloj de Windows.</p>}
          <button onClick={() => { setQuery(''); setSearchOpen(true) }} className="mx-3 mb-4 flex items-center gap-2 rounded-md border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-left text-[11px] text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-300"><Search className="size-3.5 text-zinc-600" /><span className="flex-1">Buscar reuniones y notas</span><kbd className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[9px] text-zinc-600">⌘ K</kbd></button>
          <div className="flex items-center justify-between px-4 pb-2"><span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">Reuniones locales</span><button onClick={() => { setSessionTitle(''); setSessionOpen(true) }} className="text-zinc-600 hover:text-zinc-300" aria-label="Nueva sesión"><Plus className="size-3.5" /></button></div>
          <div className="flex-1 overflow-auto px-2">{meetings.map((item) => <button key={item.id} onClick={() => setSelected(item.id)} className={`group mb-1 w-full rounded-lg border px-3 py-3 text-left ${selected === item.id ? 'border-cyan-400/20 bg-cyan-400/[0.07]' : 'border-transparent hover:border-white/[0.06] hover:bg-white/[0.025]'}`}><div className="mb-2 flex items-start gap-2"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-cyan-400" /><span className={`text-[12px] leading-snug ${selected === item.id ? 'text-zinc-100' : 'text-zinc-400'}`}>{item.title}</span></div><div className="flex items-center gap-2 pl-3.5 font-mono text-[9px] text-zinc-600"><span>{item.type}</span><span>·</span><span>{formatDuration(item.durationSeconds)}</span></div></button>)}</div>
          <div className="border-t border-white/[0.07] p-3"><div className={`mb-2 flex items-center gap-2 rounded-md px-2.5 py-2 ${ollama.connected ? 'bg-emerald-400/[0.06]' : 'bg-amber-400/[0.06]'}`}><span className={`size-1.5 rounded-full ${ollama.connected ? 'bg-emerald-400' : 'bg-amber-400'}`} /><span className={`font-mono text-[9px] ${ollama.connected ? 'text-emerald-300' : 'text-amber-300'}`}>Ollama: {ollama.connected ? 'conectado' : 'sin conexión'}</span><button onClick={() => void fetch(`/api/ollama?url=${encodeURIComponent(settings.ollamaUrl)}`).then((r) => r.json()).then(setOllama)} className="ml-auto font-mono text-[9px] text-zinc-600">:11434 ↻</button></div><div className="flex items-center gap-2 px-2 text-[9px] text-zinc-600"><Archive className="size-3" /> IndexedDB en este dispositivo <span>·</span> sin nube</div><button onClick={() => setSettingsOpen(true)} className="mt-3 flex items-center gap-2 px-2 text-[10px] text-zinc-500 hover:text-zinc-300"><Settings2 className="size-3.5" /> Ajustes locales</button></div>
        </div></aside>
        <section className="min-w-0 flex-1">
          <header className="flex h-[68px] items-center justify-between border-b border-white/[0.07] px-5 lg:px-8"><div className="flex min-w-0 items-center gap-3">{!sidebarOpen && <button onClick={() => setSidebarOpen(true)} className="rounded-md p-1.5 text-zinc-500" aria-label="Abrir barra lateral"><Menu className="size-4" /></button>}<div className="min-w-0"><div className="flex items-center gap-2"><span className="font-mono text-[10px] text-zinc-600">NOTAS FANTASMA / {selectedMeeting.id.slice(0, 6).toUpperCase()}</span><span className="text-zinc-700">/</span><span className="truncate text-[13px] font-medium text-zinc-200">{selectedMeeting.title}</span><ChevronDown className="size-3.5 shrink-0 text-zinc-600" /></div><div className="mt-1 flex items-center gap-2"><span className="size-1.5 rounded-full bg-emerald-400" /><span className="font-mono text-[9px] text-zinc-600">PERSISTIDO EN ESTE DISPOSITIVO</span></div></div></div><div className="flex items-center gap-2"><button onClick={() => void copyMarkdown()} className="hidden items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] text-zinc-400 sm:flex">{copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}{copied ? 'Copiado' : 'Copiar Markdown'}</button><button onClick={() => exportMarkdown(selectedMeeting)} className="rounded-md p-2 text-zinc-600 hover:bg-white/5 hover:text-zinc-300" aria-label="Descargar Markdown"><Download className="size-4" /></button><button onClick={() => void removeMeeting(selectedMeeting)} className="rounded-md p-2 text-zinc-600 hover:bg-rose-400/10 hover:text-rose-300" aria-label="Eliminar reunión"><Trash2 className="size-4" /></button></div></header>
          <div className="border-b border-white/[0.07] px-5 lg:px-8"><div className="flex gap-6 overflow-x-auto"><Tab active={tab === 'notes'} onClick={() => setTab('notes')} icon={<FileText className="size-3.5" />}>Notas</Tab><Tab active={tab === 'transcript'} onClick={() => setTab('transcript')} icon={<AudioLines className="size-3.5" />}>Transcripción <Badge>{selectedMeeting.transcript.length}</Badge></Tab><Tab active={tab === 'audio'} onClick={() => setTab('audio')} icon={<Gauge className="size-3.5" />}>Audio</Tab></div></div>
          <div className="mx-auto max-w-[1050px] px-5 py-7 lg:px-8"><div className="mb-6 flex flex-wrap items-center gap-2"><Badge><Clock3 className="mr-1.5 size-3" />{formatDuration(selectedMeeting.durationSeconds)}</Badge><Badge><Mic2 className="mr-1.5 size-3" />{settings.whisperModel}</Badge><Badge><Terminal className="mr-1.5 size-3" />{settings.ollamaModel}</Badge><Badge><Activity className="mr-1.5 size-3" />{selectedMeeting.audio ? 'audio guardado' : 'sin audio'}</Badge><div className="ml-auto flex items-center gap-3"><button onClick={() => void exportObsidian()} className="flex items-center gap-1.5 text-[10px] text-zinc-500 hover:text-zinc-200"><Upload className="size-3" /> Obsidian</button><button onClick={() => exportTranscriptText(selectedMeeting)} disabled={!selectedMeeting.transcript.length} className="flex items-center gap-1.5 text-[10px] text-zinc-500 hover:text-zinc-200 disabled:opacity-40"><Download className="size-3" /> .txt</button><button onClick={() => exportMarkdown(selectedMeeting)} className="flex items-center gap-1.5 text-[10px] text-zinc-500 hover:text-zinc-200"><Download className="size-3" /> .md</button></div></div>{tab === 'notes' && <Notes meeting={selectedMeeting} toggleAction={toggleAction} busy={busy} onSynthesize={() => void synthesize(selectedMeeting, settings, ollama.connected, persist, showToast, setBusy)} />}{tab === 'transcript' && <Transcript meeting={selectedMeeting} liveStatus={liveMode.current ? liveStatus : undefined} />}{tab === 'audio' && <AudioPanel meeting={selectedMeeting} onDownload={() => exportAudio(selectedMeeting)} onOpen={() => void openInObsidian()} />}</div>
        </section>
      </div>
      {settingsOpen && <SettingsDrawer settings={settings} ollama={ollama} desktopMode={desktopMode} onSave={saveLocalSettings} onExport={exportObsidian} onDeleteAll={clearAllLocalMeetings} onConnectCalendar={connectCalendar} onDisconnectCalendar={disconnectCalendar} calendarStatus={calendarStatus} calendarEvents={calendarEvents} calendarConnected={Boolean(calendarToken)} calendarBusy={calendarBusy} onClose={() => setSettingsOpen(false)} />}
      {sessionOpen && <SessionModal title={sessionTitle} setTitle={setSessionTitle} error={recordingError} desktopMode={desktopMode} transcriptionMode={transcriptionMode} setTranscriptionMode={setTranscriptionMode} onClose={() => setSessionOpen(false)} onCreate={() => void createMeeting(transcriptionMode)} />}
      {recordedAudio && !recording && <div className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-xl items-center gap-3 rounded-xl border border-cyan-400/20 bg-[#111116] p-4 shadow-2xl"><div className="flex-1"><div className="text-xs font-medium text-zinc-200">Audio capturado · {formatDuration(seconds)}</div><div className="mt-1 text-[10px] text-zinc-500">Puedes transcribir con Whisper local o conservar la grabación.</div></div><button disabled={busy} onClick={() => void finishSession()} className="rounded-md bg-cyan-600 px-3 py-2 text-[10px] font-semibold text-white disabled:opacity-50">{busy ? 'Procesando…' : 'Guardar y transcribir'}</button><button disabled={busy} onClick={() => void finishSession(false)} className="rounded-md border border-white/10 px-3 py-2 text-[10px] text-zinc-300 disabled:opacity-50">Solo guardar</button><button onClick={() => setRecordedAudio(null)} aria-label="Descartar audio" className="p-2 text-zinc-600"><X className="size-4" /></button></div>}
      {searchOpen && <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/65 px-4 pt-[18vh] backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) setSearchOpen(false) }}><div className="w-full max-w-xl overflow-hidden rounded-xl border border-white/10 bg-[#111116] shadow-2xl"><div className="flex items-center gap-3 border-b border-white/[0.07] px-4"><Search className="size-4 text-zinc-500" /><input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-600" placeholder="Buscar reuniones y transcripciones..." /><kbd className="font-mono text-[10px] text-zinc-600">ESC</kbd></div><div className="max-h-72 overflow-auto p-2">{filteredMeetings.map((item) => <button key={item.id} onClick={() => { setSelected(item.id); setSearchOpen(false) }} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-white/[0.05]"><FileText className="size-4 text-cyan-400" /><span className="flex-1 text-sm text-zinc-200">{item.title}</span><span className="font-mono text-[10px] text-zinc-600">{new Date(item.createdAt).toLocaleDateString()}</span></button>)}</div></div></div>}
      {toast && <div role="status" className="fixed bottom-5 left-1/2 z-[70] -translate-x-1/2 rounded-lg border border-white/10 bg-zinc-900 px-4 py-3 text-xs text-zinc-200 shadow-xl">{toast}</div>}
    </main>
  )
}

function slug(value: string) { return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') }
function readableError(error: unknown, fallback: string) { if (typeof error === 'string' && error.trim()) return error; if (error instanceof Error && error.message) return error.message; if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message; return fallback }
function formatBytes(bytes: number) { return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB` }
function formatClock(seconds: number) { return formatDuration(Math.floor(seconds)) }
function parseClockSeconds(value: string) { const parts = value.split(':').map(Number); return parts.reduce((total, part) => total * 60 + part, 0) }
function normalizeTranscript(value: string) { return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim() }

async function transcribeAudio(audio: Blob, settings: LocalSettings, channel: StoredTranscript['channel'], speaker: string, offsetSeconds = 0): Promise<StoredTranscript[]> {
  const extension = audio.type === 'audio/wav' ? 'wav' : 'webm'
  const form = new FormData()
  form.set('audio', audio, `localghost-${channel}-${Date.now()}.${extension}`)
  form.set('model', settings.whisperModel)
  const response = await fetch('/api/transcribe', { method: 'POST', body: form })
  const data = await response.json() as { error?: string; text?: string; segments?: { start?: number; text?: string }[] }
  if (!response.ok) throw new Error(data.error || 'Whisper no pudo transcribir el audio.')
  const segments = data.segments || []
  if (segments.length) return segments.filter((segment) => segment.text?.trim()).map((segment) => ({ id: crypto.randomUUID(), time: formatClock(offsetSeconds + (segment.start || 0)), speaker, text: segment.text!.trim(), channel }))
  return (data.text || '').split(/(?<=[.!?])\s+/).filter(Boolean).map((text, index) => ({ id: crypto.randomUUID(), time: formatClock(offsetSeconds + index), speaker, text: text.trim(), channel }))
}

async function splitStereoPcmWav(audio: Blob): Promise<[Blob, Blob] | null> {
  if (audio.type !== 'audio/wav') return null
  const buffer = await audio.arrayBuffer()
  const view = new DataView(buffer)
  if (view.byteLength < 44 || view.getUint16(22, true) !== 2 || view.getUint16(34, true) !== 16) return null
  const channels: [number[], number[]] = [[], []]
  for (let offset = 44; offset + 3 < view.byteLength; offset += 4) {
    channels[0].push(view.getInt16(offset, true)); channels[1].push(view.getInt16(offset + 2, true))
  }
  const sampleRate = view.getUint32(24, true)
  return [wavMono(channels[0], sampleRate), wavMono(channels[1], sampleRate)]
}

function wavMono(samples: number[], sampleRate: number): Blob {
  const bytes = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(bytes)
  const ascii = (offset: number, value: string) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)))
  ascii(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); ascii(8, 'WAVE'); ascii(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); ascii(36, 'data'); view.setUint32(40, samples.length * 2, true)
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, sample, true))
  return new Blob([bytes], { type: 'audio/wav' })
}
function downloadBlob(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url) }
async function synthesize(meeting: MeetingRecord, settings: LocalSettings, connected: boolean, persist: (meeting: MeetingRecord) => Promise<void>, notify: (message: string) => void, setBusy: (busy: boolean) => void) {
  if (!meeting.transcript.length) { notify('Primero captura audio y transcríbelo con Whisper local.'); return }
  if (!connected) { notify('Ollama no está conectado en localhost:11434.'); return }
  setBusy(true)
  try {
    const response = await fetch('/api/ollama', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: settings.ollamaModel, url: settings.ollamaUrl, prompt: `Analiza la transcripción y responde exclusivamente con JSON válido, sin bloques Markdown, usando exactamente esta estructura: {"summary":"Resumen ejecutivo en 2 o 3 frases, sin repetir la lista de acciones","decisions":["decisión explícita"],"actions":[{"text":"tarea concreta acordada","owner":"responsable mencionado o cadena vacía"}]}. No inventes datos. Incluye en actions únicamente tareas que alguien se comprometió a hacer; una decisión no es una tarea. Usa listas vacías cuando no existan. Escribe en español.\n\nTRANSCRIPCIÓN:\n${meeting.transcript.map((line) => `[${line.time}] ${line.speaker}: ${line.text}`).join('\n')}` }) })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error)
    const result = parseMeetingSummary(data.text)
    await persist({ ...meeting, summary: result.summary, actions: result.actions })
    notify('Resumen y acuerdos generados con Ollama local.')
  } catch (error) { notify(error instanceof Error ? error.message : 'Ollama no pudo generar el resumen.') } finally { setBusy(false) }
}
type SummaryResult = { summary: string; decisions: string[]; actions: MeetingRecord['actions'] }
function parseMeetingSummary(raw: string): SummaryResult {
  const legacy = raw.split(/\*{0,2}decisiones y acciones:?\*{0,2}/i)
  if (legacy.length > 1) {
    const summary = legacy[0].trim().replace(/[\s.,;:-]+$/, '')
    const actionLines = legacy.slice(1).join('\n').split(/\n|\s+-\s+/).map((line) => line.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean)
    return { summary, decisions: [], actions: actionLines.map((text) => ({ id: `legacy-${text}`, text, owner: '', done: false })) }
  }
  const fallback = { summary: raw.trim(), decisions: [] as string[], actions: [] as MeetingRecord['actions'] }
  const json = raw.match(/\{[\s\S]*\}/)?.[0]
  if (!json) return fallback
  try {
    const value = JSON.parse(json) as { summary?: unknown; decisions?: unknown; actions?: unknown }
    const summary = typeof value.summary === 'string' ? value.summary.trim() : ''
    const decisions = Array.isArray(value.decisions) ? value.decisions.filter((item): item is string => typeof item === 'string' && !!item.trim()).map((item) => item.trim()) : []
    const actions = Array.isArray(value.actions) ? value.actions.flatMap((item, index) => {
      if (!item || typeof item !== 'object' || !('text' in item) || typeof item.text !== 'string' || !item.text.trim()) return []
      return [{ id: `summary-${index}`, text: item.text.trim(), owner: 'owner' in item && typeof item.owner === 'string' ? item.owner.trim() : '', done: false }]
    }) : []
    return { summary: summary || fallback.summary, decisions, actions }
  } catch { return fallback }
}
function Notes({ meeting, toggleAction, busy, onSynthesize }: { meeting: MeetingRecord; toggleAction: (id: string) => void; busy: boolean; onSynthesize: () => void }) {
  const summary = parseMeetingSummary(meeting.summary)
  const actions = meeting.actions.length ? meeting.actions : summary.actions
  const decisions = summary.decisions
  return <div className="max-w-[900px] space-y-6">
    <div className="flex items-center justify-between"><SectionTitle index="01" title="Resumen ejecutivo" meta="GENERADO LOCALMENTE" /><button disabled={busy || !meeting.transcript.length} onClick={onSynthesize} className="flex items-center gap-2 rounded-md bg-cyan-500/10 px-3 py-2 text-[10px] text-cyan-300 disabled:opacity-40"><Sparkles className="size-3.5" />{busy ? 'Procesando…' : meeting.summary ? 'Regenerar resumen' : 'Generar resumen'}</button></div>
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 text-[12px] leading-6 text-zinc-300">{summary.summary ? <p className="whitespace-pre-wrap">{summary.summary.replace(/\*\*/g, '').replace(/^#{1,6}\s+/gm, '')}</p> : 'Aún no hay resumen. Transcribe la sesión y pulsa Generar resumen.'}</div>
    {decisions.length > 0 && <section className="space-y-3"><SectionTitle index="02" title="Decisiones" meta={`${decisions.length} ELEMENTOS`} /><ul className="space-y-2">{decisions.map((decision, index) => <li key={`${index}-${decision}`} className="flex gap-3 rounded-lg border border-cyan-400/10 bg-cyan-400/[0.03] px-4 py-3 text-[11px] leading-5 text-zinc-300"><Check className="mt-0.5 size-3.5 shrink-0 text-cyan-400" />{decision}</li>)}</ul></section>}
    <section className="space-y-3"><SectionTitle index={decisions.length ? '03' : '02'} title="Acuerdos y tareas" meta={`${actions.length} ELEMENTOS`} /><div className="space-y-2">{actions.length ? actions.map((action) => <label key={action.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-[11px] text-zinc-300"><input type="checkbox" checked={action.done} onChange={() => toggleAction(action.id)} className="accent-cyan-500" /><span className={`flex-1 ${action.done ? 'text-zinc-600 line-through' : ''}`}>{action.text}</span>{action.owner && <span className="font-mono text-[9px] text-zinc-600">{action.owner}</span>}</label>) : <p className="rounded-lg border border-dashed border-white/[0.08] px-4 py-4 text-[11px] text-zinc-600">Aún no se detectaron tareas concretas en la transcripción.</p>}</div></section>
    <section className="space-y-3"><SectionTitle index={decisions.length ? '04' : '03'} title="Etiquetas" />{meeting.tags.length ? <div className="flex gap-2">{meeting.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}</div> : <p className="text-[11px] text-zinc-600">Sin etiquetas todavía.</p>}</section>
  </div>
}
function Tab({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) { return <button onClick={onClick} className={`relative flex items-center gap-2 py-3.5 text-[11px] font-medium ${active ? 'text-zinc-100' : 'text-zinc-600 hover:text-zinc-400'}`}>{active && <span className="absolute inset-x-0 bottom-0 h-px bg-cyan-400" />}{icon}{children}</button> }
function SectionTitle({ index, title, meta }: { index: string; title: string; meta?: string }) { return <div className="flex items-center gap-3"><span className="font-mono text-[10px] text-cyan-400/70">{index}</span><h2 className="text-[13px] font-semibold text-zinc-200">{title}</h2>{meta && <span className="ml-auto font-mono text-[9px] text-zinc-600">{meta}</span>}</div> }
function Decision({ label, text, tone }: { label: string; text: string; tone: string }) { return <div className="rounded-md bg-black/20 p-3"><div className={`mb-1 text-[9px] uppercase tracking-wider ${tone === 'emerald' ? 'text-emerald-400' : 'text-amber-400'}`}>{label}</div><div className="font-mono text-[10px] text-zinc-400">{text}</div></div> }
function CodeLine({ code }: { code: string }) { return <div className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-black/20 px-3 py-3 font-mono text-[10px] text-cyan-200/70"><Code2 className="size-3 text-zinc-700" />{code}</div> }
function Transcript({ meeting, liveStatus }: { meeting: MeetingRecord; liveStatus?: string }) {
  const [filter, setFilter] = useState('')
  const rows = meeting.transcript.filter((row) => `${row.time} ${row.speaker} ${row.text}`.toLowerCase().includes(filter.toLowerCase()))
  return <div className="max-w-[850px]">
    {liveStatus && <div aria-live="polite" className="mb-4 flex items-center gap-2 rounded-lg border border-cyan-400/15 bg-cyan-400/[0.04] px-3 py-2.5 text-[10px] text-cyan-200"><span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-cyan-400 opacity-50" /><span className="relative inline-flex size-2 rounded-full bg-cyan-400" /></span>{liveStatus}</div>}
    <div className="mb-5 flex items-center gap-3 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2"><Search className="size-3.5 text-zinc-600" /><input value={filter} onChange={(e) => setFilter(e.target.value)} className="flex-1 bg-transparent text-[11px] text-zinc-300 outline-none" placeholder="Buscar en la transcripción..." /></div>
    {rows.length ? <div className="space-y-2">{rows.map((line) => <div key={line.id} className="group grid grid-cols-[64px_130px_1fr] gap-4 rounded-lg px-3 py-4 hover:bg-white/[0.02]"><span className="font-mono text-[10px] text-zinc-600">{line.time}</span><span className={`text-[9px] font-semibold ${line.channel === 'mic' ? 'text-cyan-300' : 'text-sky-300'}`}>{line.speaker}</span><p className="text-[12px] leading-5 text-zinc-400">{line.text}</p></div>)}</div> : <p className="py-14 text-center text-xs text-zinc-600">{filter ? 'Sin resultados.' : liveStatus ? 'Esperando las primeras palabras…' : 'Aún no hay transcripción. Graba y procesa audio con el servicio Whisper local.'}</p>}
  </div>
}
function AudioPanel({ meeting, onDownload, onOpen }: { meeting: MeetingRecord; onDownload: () => void; onOpen: () => void }) { const url = useMemo(() => meeting.audio ? URL.createObjectURL(meeting.audio) : '', [meeting.audio]); useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url]); return <div className="max-w-[900px] rounded-xl border border-white/[0.08] bg-white/[0.02] p-5"><div className="mb-5 flex items-center justify-between"><div><div className="text-[12px] font-medium text-zinc-200">Audio de la sesión</div><div className="mt-1 font-mono text-[9px] text-zinc-600">{meeting.audio ? 'Grabado localmente en este navegador' : 'No hay audio grabado'}</div></div>{meeting.audio && <div className="flex gap-2"><button onClick={onOpen} className="flex items-center gap-1.5 rounded-md border border-cyan-400/20 px-2.5 py-2 text-[10px] text-cyan-200 hover:bg-cyan-400/10"><FileText className="size-3" /> Abrir en Obsidian</button><button onClick={onDownload} className="flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-2 text-[10px] text-zinc-300 hover:border-cyan-400/30 hover:text-cyan-200"><Download className="size-3" /> Descargar audio</button></div>}</div>{meeting.audio && <audio controls src={url} className="w-full" />}<p className="mt-4 text-[10px] leading-5 text-zinc-600">{meeting.audio?.type === 'audio/wav' ? 'WAV estéreo: canal 1 micrófono y canal 2 salida predeterminada de Windows.' : 'Audio local del micrófono.'}</p></div> }
function SettingsDrawer({ settings, ollama, desktopMode, onSave, onExport, onDeleteAll, onConnectCalendar, onDisconnectCalendar, calendarStatus, calendarEvents, calendarConnected, calendarBusy, onClose }: { settings: LocalSettings; ollama: { connected: boolean; models: { name: string }[] }; desktopMode: boolean; onSave: (settings: LocalSettings) => void; onExport: () => void; onDeleteAll: () => void; onConnectCalendar: (clientId: string, clientSecret: string) => void; onDisconnectCalendar: () => void; calendarStatus: string; calendarEvents: CalendarEvent[]; calendarConnected: boolean; calendarBusy: boolean; onClose: () => void }) {
  const [draft, setDraft] = useState(settings)
  const [storageBytes, setStorageBytes] = useState<number | null>(null)
  const [calendarIdentityReady, setCalendarIdentityReady] = useState(false)
  const [calendarClientSecret, setCalendarClientSecret] = useState('')
  useEffect(() => setDraft(settings), [settings])
  useEffect(() => { void navigator.storage?.estimate().then((estimate) => setStorageBytes(estimate.usage ?? 0)).catch(() => setStorageBytes(null)) }, [])
  useEffect(() => {
    let active = true
    setCalendarIdentityReady(false)
    if (!draft.googleCalendarClientId.trim()) return () => { active = false }
    if (desktopMode) { setCalendarIdentityReady(true); return () => { active = false } }
    void loadCalendarIdentity().then(() => { if (active) setCalendarIdentityReady(true) }).catch(() => { if (active) setCalendarIdentityReady(false) })
    return () => { active = false }
  }, [draft.googleCalendarClientId, desktopMode])
  useEffect(() => {
    if (!desktopMode) return
    let active = true
    void invoke<string | null>('load_calendar_client_secret').then((secret) => { if (active && secret) setCalendarClientSecret(secret) }).catch(() => {})
    return () => { active = false }
  }, [desktopMode])
  const profiles: Record<LocalSettings['performanceProfile'], { title: string; whisperModel: string; ollamaModel: string }> = {
    lite: { title: 'Ligero · solo CPU', whisperModel: 'Systran/faster-whisper-small', ollamaModel: 'qwen3:1.7b' },
    balanced: { title: 'Equilibrado', whisperModel: 'Systran/faster-whisper-medium', ollamaModel: 'qwen3:4b' },
    quality: { title: 'Alta calidad', whisperModel: 'Systran/faster-whisper-large-v3', ollamaModel: 'llama3.1:8b' },
  }
  return <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}><div className="h-full w-full max-w-[400px] overflow-y-auto border-l border-white/10 bg-[#101014] p-6 shadow-2xl"><div className="mb-8 flex items-center justify-between"><div><div className="text-[14px] font-semibold">Configuración local</div><div className="mt-1 font-mono text-[9px] text-zinc-600">SERVICIOS EN LOCALHOST</div></div><button onClick={onClose} aria-label="Cerrar ajustes"><X className="size-4" /></button></div><div className="space-y-6">
    <label className="block text-[10px] text-zinc-400">Perfil de rendimiento<select value={draft.performanceProfile} onChange={(e) => { const profile = e.target.value as LocalSettings['performanceProfile']; setDraft({ ...draft, performanceProfile: profile, whisperModel: profiles[profile].whisperModel, ollamaModel: profiles[profile].ollamaModel }) }} className="mt-2 w-full rounded-md border border-white/10 bg-black/20 px-3 py-2.5 text-[11px] text-zinc-200">{Object.entries(profiles).map(([key, profile]) => <option key={key} value={key}>{profile.title}</option>)}</select></label>
    <div className="rounded-md border border-cyan-400/15 bg-cyan-400/[0.04] p-3 text-[10px] leading-5 text-cyan-100/70">Este perfil usa {profiles[draft.performanceProfile].whisperModel} y {profiles[draft.performanceProfile].ollamaModel}. La transcripción y el resumen se ejecutan por turnos para reducir memoria.</div>
    <label className="block text-[10px] text-zinc-400">Modelo de síntesis<select value={draft.ollamaModel} onChange={(e) => setDraft({ ...draft, ollamaModel: e.target.value })} className="mt-2 w-full rounded-md border border-white/10 bg-black/20 px-3 py-2.5 font-mono text-[10px] text-zinc-200">{[draft.ollamaModel, ...ollama.models.map((model) => model.name)].filter((name, index, all) => all.indexOf(name) === index).map((name) => <option key={name}>{name}</option>)}</select></label>
    <label className="block text-[10px] text-zinc-400">Conservar reuniones<select value={draft.retentionDays} onChange={(e) => setDraft({ ...draft, retentionDays: Number(e.target.value) as LocalSettings['retentionDays'] })} className="mt-2 w-full rounded-md border border-white/10 bg-black/20 px-3 py-2.5 text-[11px] text-zinc-200"><option value={0}>Hasta que las borre manualmente</option><option value={1}>1 día</option><option value={7}>7 días</option><option value={30}>30 días</option><option value={90}>90 días</option></select></label>
    <div className="rounded-md border border-white/10 bg-black/20 p-3 text-[10px] leading-5 text-zinc-500">El audio, las transcripciones y las notas se guardan en el almacenamiento local de LocalGhost en este equipo. {draft.retentionDays === 0 ? 'No se borran por antigüedad.' : `Se eliminarán automáticamente después de ${draft.retentionDays} día${draft.retentionDays === 1 ? '' : 's'}.`} {storageBytes !== null && <span>Uso local estimado: {formatBytes(storageBytes)}.</span>}</div>
    <section className="space-y-3 rounded-lg border border-cyan-400/15 bg-cyan-400/[0.03] p-3">
      <div className="flex items-center gap-2 text-[11px] font-medium text-zinc-200"><CalendarDays className="size-4 text-cyan-300" /> Recordatorios de Google Calendar</div>
      <p className="text-[10px] leading-5 text-zinc-500">LocalGhost leerá eventos de tu calendario principal y te avisará 10 minutos antes. El permiso es solo de lectura; audio y notas no se comparten. La app debe estar abierta para avisarte.</p>
      <label className="block text-[10px] text-zinc-400">ID OAuth de Google · tipo {desktopMode ? 'Aplicación de escritorio' : 'Aplicación web'}<input value={draft.googleCalendarClientId} onChange={(e) => setDraft({ ...draft, googleCalendarClientId: e.target.value })} placeholder="xxxxx.apps.googleusercontent.com" className="mt-2 w-full rounded-md border border-white/10 bg-black/20 px-3 py-2.5 font-mono text-[10px] text-zinc-200" /></label>
      {desktopMode && <><label className="block text-[10px] text-zinc-400">Client secret<input type="password" autoComplete="off" value={calendarClientSecret} onChange={(e) => setCalendarClientSecret(e.target.value)} placeholder="GOCSPX-…" className="mt-2 w-full rounded-md border border-white/10 bg-black/20 px-3 py-2.5 font-mono text-[10px] text-zinc-200" /></label><p className="text-[9px] leading-4 text-zinc-600">Si Google lo solicita, copia el secreto desde Google Cloud → tu cliente OAuth. Se guarda cifrado en este PC; no lo envíes por chat.</p></>}
      <button disabled={calendarBusy || !calendarIdentityReady || (desktopMode && !calendarClientSecret.trim())} onClick={() => onConnectCalendar(draft.googleCalendarClientId, calendarClientSecret)} className="w-full rounded-md border border-cyan-400/20 bg-cyan-400/10 py-2.5 text-[10px] font-semibold text-cyan-200 disabled:opacity-40">{calendarBusy ? 'Conectando…' : !calendarIdentityReady && draft.googleCalendarClientId.trim() ? 'Cargando autorización…' : calendarConnected ? 'Actualizar conexión de Google Calendar' : 'Conectar Google Calendar'}</button>
      {calendarStatus && <p role="status" className="text-[10px] leading-5 text-zinc-400">{calendarStatus}</p>}
      {calendarConnected && <><div className="max-h-36 space-y-2 overflow-y-auto">{calendarEvents.length ? calendarEvents.slice(0, 5).map((event) => <div key={event.id} className="rounded-md bg-black/20 px-3 py-2"><div className="text-[10px] text-zinc-300">{event.summary}</div><div className="mt-1 font-mono text-[9px] text-zinc-600">{new Date(event.start).toLocaleString()}</div></div>) : <p className="text-[10px] text-zinc-600">No hay reuniones próximas en las siguientes 24 horas.</p>}</div><button onClick={onDisconnectCalendar} className="text-[10px] text-zinc-500 underline underline-offset-2">Desconectar calendario</button></>}
    </section>
    <label className="block text-[10px] text-zinc-400">URL local de Ollama<input value={draft.ollamaUrl} onChange={(e) => setDraft({ ...draft, ollamaUrl: e.target.value })} className="mt-2 w-full rounded-md border border-white/10 bg-black/20 px-3 py-2.5 font-mono text-[10px] text-zinc-200" /></label>
    <label className="block text-[10px] text-zinc-400">Ruta del vault Obsidian<input value={draft.obsidianPath} onChange={(e) => setDraft({ ...draft, obsidianPath: e.target.value })} placeholder="C:\\Users\\...\\Obsidian\\Work" className="mt-2 w-full rounded-md border border-white/10 bg-black/20 px-3 py-2.5 font-mono text-[10px] text-zinc-200" /></label>
    <div className="rounded-md border border-white/10 bg-black/20 p-3 text-[10px] text-zinc-500">Ollama: <span className={ollama.connected ? 'text-emerald-300' : 'text-amber-300'}>{ollama.connected ? `${ollama.models.length} modelos disponibles` : 'no disponible'}</span><br />Whisper local: Speaches en CPU en el puerto 8000.</div>
    <button onClick={() => { onSave(draft); onClose() }} className="w-full rounded-md bg-cyan-600 py-2.5 text-[11px] font-semibold text-white">Guardar ajustes</button><button onClick={onDeleteAll} className="w-full rounded-md border border-rose-400/20 py-2.5 text-[11px] text-rose-300">Borrar todas las reuniones y sus audios</button><button onClick={onExport} className="w-full rounded-md border border-white/10 py-2.5 text-[11px] text-zinc-300">Exportar nota seleccionada a Obsidian</button>
  </div></div></div>
}
function SessionModal({ title, setTitle, error, desktopMode, transcriptionMode, setTranscriptionMode, onClose, onCreate }: { title: string; setTitle: (title: string) => void; error: string; desktopMode: boolean; transcriptionMode: TranscriptionMode; setTranscriptionMode: (mode: TranscriptionMode) => void; onClose: () => void; onCreate: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"><div className="w-full max-w-[470px] rounded-xl border border-white/10 bg-[#111116] p-6 shadow-2xl">
    <div className="mb-6 flex items-start justify-between"><div><div className="flex items-center gap-2 text-[15px] font-semibold"><img src="/localghost-icon.png" alt="" className="size-8" />Nueva sesión</div><div className="mt-2 font-mono text-[9px] text-zinc-600">{desktopMode ? 'MICRÓFONO + SALIDA DE WINDOWS' : 'MICRÓFONO LOCAL'}</div></div><button onClick={onClose} aria-label="Cerrar"><X className="size-4" /></button></div>
    <label className="mb-5 block text-[10px] text-zinc-400">Nombre de la reunión<input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Revisión de arquitectura" className="mt-2 w-full rounded-md border border-white/10 bg-black/20 px-3 py-2.5 text-xs text-zinc-100 outline-none focus:border-cyan-400/50" /></label>
    <fieldset className="mb-5"><legend className="mb-2 text-[10px] font-medium text-zinc-300">¿Cuándo transcribir?</legend><div className="grid grid-cols-2 gap-2">
      <label className={`cursor-pointer rounded-lg border p-3 ${transcriptionMode === 'live' ? 'border-cyan-400/40 bg-cyan-400/[0.08]' : 'border-white/[0.08] bg-black/20'}`}><input type="radio" name="transcription-mode" checked={transcriptionMode === 'live'} onChange={() => setTranscriptionMode('live')} className="sr-only" /><span className="block text-[11px] font-medium text-zinc-200">En vivo</span><span className="mt-1 block text-[9px] leading-4 text-zinc-500">Whisper va escribiendo durante la captura; usa más recursos.</span></label>
      <label className={`cursor-pointer rounded-lg border p-3 ${transcriptionMode === 'after' ? 'border-cyan-400/40 bg-cyan-400/[0.08]' : 'border-white/[0.08] bg-black/20'}`}><input type="radio" name="transcription-mode" checked={transcriptionMode === 'after'} onChange={() => setTranscriptionMode('after')} className="sr-only" /><span className="block text-[11px] font-medium text-zinc-200">Al terminar</span><span className="mt-1 block text-[9px] leading-4 text-zinc-500">Transcribe una vez al detener; consume menos mientras grabas.</span></label>
    </div></fieldset>
    <div className="mb-5 rounded-md border border-amber-400/15 bg-amber-400/[0.04] p-3 text-[10px] leading-5 text-amber-200/70">{desktopMode ? 'Se capturarán el micrófono y la salida predeterminada de Windows, incluida Meet, YouTube y otras aplicaciones.' : 'En el navegador solo se captura el micrófono. Usa la app de escritorio para capturar el audio del sistema.'} El audio y la transcripción permanecen en este equipo.</div>
    {error && <p className="mb-3 text-xs text-rose-300">{error}</p>}<button onClick={onCreate} className="flex w-full items-center justify-center gap-2 rounded-md bg-cyan-600 py-2.5 text-[11px] font-semibold text-white"><Mic2 className="size-3.5" /> Crear sesión y grabar</button>
  </div></div>
}
