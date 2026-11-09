export type StoredAction = { id: string; text: string; owner: string; done: boolean }
export type StoredTranscript = { id: string; time: string; speaker: string; text: string; channel: 'mic' | 'system' }
export type MeetingRecord = {
  id: string
  title: string
  type: string
  createdAt: string
  durationSeconds: number
  audio?: Blob
  transcript: StoredTranscript[]
  actions: StoredAction[]
  summary: string
  tags: string[]
}
export type LocalSettings = { performanceProfile: 'lite' | 'balanced' | 'quality'; whisperModel: string; whisperLanguage: 'auto' | 'es' | 'en' | 'pt' | 'fr' | 'de' | 'it'; ollamaModel: string; ollamaUrl: string; obsidianPath: string; retentionDays: 0 | 1 | 7 | 30 | 90; googleCalendarClientId: string }

const DB_NAME = 'localghost-db'
const DB_VERSION = 1
const MEETINGS = 'meetings'
const SETTINGS = 'settings'
const defaults: LocalSettings = { performanceProfile: 'lite', whisperModel: 'Systran/faster-whisper-small', whisperLanguage: 'es', ollamaModel: 'qwen3:1.7b', ollamaUrl: 'http://127.0.0.1:11434', obsidianPath: '', retentionDays: 0, googleCalendarClientId: '' }

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(MEETINGS)) db.createObjectStore(MEETINGS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(SETTINGS)) db.createObjectStore(SETTINGS)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function listMeetings(): Promise<MeetingRecord[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(MEETINGS, 'readonly').objectStore(MEETINGS).getAll()
    request.onsuccess = () => resolve((request.result as MeetingRecord[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    request.onerror = () => reject(request.error)
  })
}

export async function saveMeeting(meeting: MeetingRecord): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEETINGS, 'readwrite')
    tx.objectStore(MEETINGS).put(meeting)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function deleteMeeting(id: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEETINGS, 'readwrite')
    tx.objectStore(MEETINGS).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function deleteAllMeetings(): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEETINGS, 'readwrite')
    tx.objectStore(MEETINGS).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function deleteExpiredMeetings(retentionDays: LocalSettings['retentionDays'], now = Date.now()): Promise<number> {
  if (retentionDays === 0) return 0
  const cutoff = now - retentionDays * 24 * 60 * 60 * 1000
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEETINGS, 'readwrite')
    const store = tx.objectStore(MEETINGS)
    const request = store.getAll()
    let deleted = 0
    request.onsuccess = () => {
      for (const meeting of request.result as MeetingRecord[]) {
        const createdAt = Date.parse(meeting.createdAt)
        if (Number.isFinite(createdAt) && createdAt <= cutoff) {
          store.delete(meeting.id)
          deleted += 1
        }
      }
    }
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => resolve(deleted)
    tx.onerror = () => reject(tx.error)
  })
}

export async function getSettings(): Promise<LocalSettings> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(SETTINGS, 'readonly').objectStore(SETTINGS).get('preferences')
    request.onsuccess = () => {
      const saved = request.result as Partial<LocalSettings> | undefined
      const migrated = saved && !saved.performanceProfile
        ? { ...saved, performanceProfile: 'lite' as const, whisperModel: defaults.whisperModel, ollamaModel: defaults.ollamaModel }
        : saved
      resolve({ ...defaults, ...migrated })
    }
    request.onerror = () => reject(request.error)
  })
}

export async function saveSettings(settings: LocalSettings): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS, 'readwrite')
    tx.objectStore(SETTINGS).put(settings, 'preferences')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export function formatMarkdown(meeting: MeetingRecord): string {
  const date = new Date(meeting.createdAt).toLocaleString()
  return `---\ntitle: "${meeting.title.replaceAll('"', '\\"')}"\ndate: "${meeting.createdAt}"\ntags: [${meeting.tags.join(', ')}]\n---\n\n# ${meeting.title}\n\n> ${date} · ${formatDuration(meeting.durationSeconds)}\n\n## Resumen ejecutivo\n${meeting.summary || '_Sin resumen todavía._'}\n\n## Acciones\n${meeting.actions.length ? meeting.actions.map((a) => `- [${a.done ? 'x' : ' '}] ${a.text}${a.owner ? ` — ${a.owner}` : ''}`).join('\n') : '_Sin acciones._'}\n\n## Transcripción\n${meeting.transcript.length ? meeting.transcript.map((line) => `- **[${line.time}] ${line.speaker}:** ${line.text}`).join('\n') : '_Sin transcripción._'}\n`
}

export function formatDuration(total: number): string {
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':')
}

export function downloadText(name: string, text: string, mime = 'text/markdown;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}
