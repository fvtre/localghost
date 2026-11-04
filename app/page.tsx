'use client'

import { useState } from 'react'
import {
  Activity,
  Archive,
  AudioLines,
  Check,
  ChevronDown,
  CircleStop,
  Clock3,
  Code2,
  Copy,
  Download,
  FileText,
  Gauge,
  Ghost,
  Hash,
  Headphones,
  Menu,
  Mic2,
  MoreHorizontal,
  PanelLeftClose,
  Play,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Square,
  Terminal,
  Upload,
  Volume2,
  X,
  Zap,
} from 'lucide-react'

const meetings = [
  { id: 1, title: 'Kame ERP & API Architecture Sync', type: 'Sprint Architecture', date: 'Today, 10:42', duration: '45 mins', color: 'violet' },
  { id: 2, title: 'Gateway latency incident', type: 'Incident Postmortem', date: 'Yesterday, 16:20', duration: '32 mins', color: 'rose' },
  { id: 3, title: 'REST vs. tRPC surface area', type: 'API Review', date: 'Oct 28, 14:05', duration: '58 mins', color: 'amber' },
  { id: 4, title: 'Weekly sync — Alberto', type: '1-on-1', date: 'Oct 25, 09:30', duration: '28 mins', color: 'sky' },
]

const initialActions = [
  { id: 1, text: 'Configure WebRTC loopback buffer', owner: '@asld', done: false },
  { id: 2, text: 'Publish ADR-014 to the engineering vault', owner: '@maria', done: true },
  { id: 3, text: 'Spike streaming transcription with Ollama', owner: '@asld', done: false },
  { id: 4, text: 'Add retry budget to the ingestion worker', owner: '@diego', done: false },
]

function Badge({ children, tone = 'default' }: { children: React.ReactNode; tone?: string }) {
  const tones: Record<string, string> = { violet: 'border-violet-400/20 bg-violet-400/10 text-violet-300', emerald: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300', amber: 'border-amber-400/20 bg-amber-400/10 text-amber-300', sky: 'border-sky-400/20 bg-sky-400/10 text-sky-300', default: 'border-white/10 bg-white/[0.04] text-zinc-400' }
  return <span className={`inline-flex items-center rounded-md border px-2 py-1 text-[10px] font-medium tracking-wide ${tones[tone] || tones.default}`}>{children}</span>
}

export default function Page() {
  const [selected, setSelected] = useState(1)
  const [tab, setTab] = useState('notes')
  const [recording, setRecording] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sessionOpen, setSessionOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [actions, setActions] = useState(initialActions)

  const meeting = meetings.find((item) => item.id === selected) || meetings[0]
  const toggleAction = (id: number) => setActions((items) => items.map((item) => item.id === id ? { ...item, done: !item.done } : item))
  const copyMarkdown = () => { setCopied(true); window.setTimeout(() => setCopied(false), 1800) }

  return (
    <main className="min-h-screen bg-[#09090b] text-zinc-100 selection:bg-violet-500/30">
      <div className="flex min-h-screen">
        <aside className={`${sidebarOpen ? 'w-[284px]' : 'w-0'} shrink-0 overflow-hidden border-r border-white/[0.07] bg-[#0d0d10] transition-all duration-300`}>
          <div className="flex h-full min-w-[284px] flex-col">
            <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-4">
              <div className="flex items-center gap-2.5"><div className="flex size-7 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300"><Ghost className="size-4" /></div><div><div className="text-[13px] font-semibold tracking-tight">Local<span className="text-violet-400">Ghost</span></div><div className="font-mono text-[9px] text-zinc-600">v0.4.2 · LOCAL FIRST</div></div></div>
              <button aria-label="Collapse sidebar" onClick={() => setSidebarOpen(false)} className="rounded-md p-1.5 text-zinc-600 hover:bg-white/5 hover:text-zinc-300"><PanelLeftClose className="size-4" /></button>
            </div>
            <div className="p-3">
              <button onClick={() => setRecording(!recording)} className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-lg border px-3 py-3 text-left transition-all ${recording ? 'border-rose-400/30 bg-rose-400/[0.08]' : 'border-violet-400/20 bg-violet-500/[0.08] hover:border-violet-400/40'}`}>
                {recording && <span className="absolute inset-0 animate-pulse bg-rose-400/[0.04]" />}
                <span className={`relative flex size-8 items-center justify-center rounded-md ${recording ? 'bg-rose-400/15 text-rose-300' : 'bg-violet-400/15 text-violet-300'}`}>{recording ? <CircleStop className="size-4" /> : <Mic2 className="size-4" />}</span>
                <span className="relative flex-1"><span className="block text-[12px] font-semibold">{recording ? 'Ghost is listening' : 'Start Ghost Mode'}</span><span className={`font-mono text-[10px] ${recording ? 'text-rose-300' : 'text-zinc-500'}`}>{recording ? '00:24:18 · 2 inputs live' : 'Capture a new session'}</span></span>
                <Zap className={`relative size-3.5 ${recording ? 'text-rose-300' : 'text-violet-300'}`} />
              </button>
              {recording && <button onClick={() => { setRecording(false); setSessionOpen(true) }} className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-rose-400/20 bg-rose-400/10 py-2 text-[10px] font-semibold text-rose-300 hover:bg-rose-400/15"><Sparkles className="size-3" /> Stop &amp; synthesize</button>}
            </div>
            <button className="mx-3 mb-4 flex items-center gap-2 rounded-md border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-left text-[11px] text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-300"><Search className="size-3.5" /><span className="flex-1">Search your ghost memory</span><kbd className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[9px] text-zinc-600">⌘ K</kbd></button>
            <div className="flex items-center justify-between px-4 pb-2"><span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">Meeting feed</span><button onClick={() => setSessionOpen(true)} className="text-zinc-600 hover:text-zinc-300" aria-label="New session"><Plus className="size-3.5" /></button></div>
            <div className="flex-1 overflow-auto px-2">
              {meetings.map((item) => <button key={item.id} onClick={() => setSelected(item.id)} className={`group mb-1 w-full rounded-lg border px-3 py-3 text-left transition-colors ${selected === item.id ? 'border-violet-400/20 bg-violet-400/[0.07]' : 'border-transparent hover:border-white/[0.06] hover:bg-white/[0.025]'}`}><div className="mb-2 flex items-start gap-2"><span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${item.color === 'violet' ? 'bg-violet-400' : item.color === 'rose' ? 'bg-rose-400' : item.color === 'amber' ? 'bg-amber-400' : 'bg-sky-400'}`} /><span className={`text-[12px] leading-snug ${selected === item.id ? 'text-zinc-100' : 'text-zinc-400'}`}>{item.title}</span></div><div className="flex items-center gap-2 pl-3.5 font-mono text-[9px] text-zinc-600"><span>{item.type}</span><span>·</span><span>{item.duration}</span></div><div className="hidden pl-3.5 pt-2 font-mono text-[9px] text-zinc-700 group-hover:block">{item.date} · llama3.1:8b</div></button>)}
            </div>
            <div className="border-t border-white/[0.07] p-3"><div className="mb-2 flex items-center gap-2 rounded-md bg-emerald-400/[0.06] px-2.5 py-2"><span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" /><span className="font-mono text-[9px] text-emerald-300">Ollama: Connected</span><span className="ml-auto font-mono text-[9px] text-zinc-600">:11434</span></div><div className="flex items-center gap-2 px-2 text-[9px] text-zinc-600"><Archive className="size-3" /> Local SQLite: 1.4 GB <span className="text-zinc-700">·</span> Zero cloud sync</div><button onClick={() => setSettingsOpen(true)} className="mt-3 flex items-center gap-2 px-2 text-[10px] text-zinc-500 hover:text-zinc-300"><Settings2 className="size-3.5" /> Engine settings</button></div>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="flex h-[68px] items-center justify-between border-b border-white/[0.07] px-5 lg:px-8"><div className="flex min-w-0 items-center gap-3">{!sidebarOpen && <button onClick={() => setSidebarOpen(true)} className="rounded-md p-1.5 text-zinc-500 hover:bg-white/5" aria-label="Open sidebar"><Menu className="size-4" /></button>}<div className="min-w-0"><div className="flex items-center gap-2"><span className="font-mono text-[10px] text-zinc-600">GHOST NOTES / 001</span><span className="text-zinc-700">/</span><button className="truncate text-[13px] font-medium text-zinc-200 hover:text-violet-300">{meeting.title}</button><ChevronDown className="size-3.5 shrink-0 text-zinc-600" /></div><div className="mt-1 flex items-center gap-2"><span className="size-1.5 rounded-full bg-emerald-400" /><span className="font-mono text-[9px] text-zinc-600">INDEXED LOCALLY · 2 MIN AGO</span></div></div></div><div className="flex items-center gap-2"><button onClick={copyMarkdown} className="hidden items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] font-medium text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200 sm:flex">{copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}{copied ? 'Copied' : 'Copy Markdown'}</button><button className="rounded-md p-2 text-zinc-600 hover:bg-white/5 hover:text-zinc-300" aria-label="More actions"><MoreHorizontal className="size-4" /></button></div></header>
          <div className="border-b border-white/[0.07] px-5 lg:px-8"><div className="flex gap-6 overflow-x-auto"><button onClick={() => setTab('notes')} className={`relative flex items-center gap-2 py-3.5 text-[11px] font-medium ${tab === 'notes' ? 'text-zinc-100' : 'text-zinc-600 hover:text-zinc-400'}`}>{tab === 'notes' && <span className="absolute inset-x-0 bottom-0 h-px bg-violet-400" />}<FileText className="size-3.5" /> Ghost Notes <Badge tone="violet">AI OUTPUT</Badge></button><button onClick={() => setTab('transcript')} className={`relative flex items-center gap-2 py-3.5 text-[11px] font-medium ${tab === 'transcript' ? 'text-zinc-100' : 'text-zinc-600 hover:text-zinc-400'}`}>{tab === 'transcript' && <span className="absolute inset-x-0 bottom-0 h-px bg-violet-400" />}<AudioLines className="size-3.5" /> Stereo Transcript</button><button onClick={() => setTab('audio')} className={`relative flex items-center gap-2 py-3.5 text-[11px] font-medium ${tab === 'audio' ? 'text-zinc-100' : 'text-zinc-600 hover:text-zinc-400'}`}>{tab === 'audio' && <span className="absolute inset-x-0 bottom-0 h-px bg-violet-400" />}<Gauge className="size-3.5" /> Audio Debugger</button></div></div>
          <div className="mx-auto max-w-[1050px] px-5 py-7 lg:px-8">
            <div className="mb-6 flex flex-wrap items-center gap-2"><Badge><Clock3 className="mr-1.5 size-3" />45 mins</Badge><Badge><Mic2 className="mr-1.5 size-3" />Whisper-Large-v3</Badge><Badge><Terminal className="mr-1.5 size-3" />Llama 3.1 8B</Badge><Badge><Activity className="mr-1.5 size-3" />2 Speakers detected</Badge><div className="ml-auto hidden items-center gap-2 sm:flex"><button className="flex items-center gap-1.5 text-[10px] text-zinc-500 hover:text-zinc-200"><Upload className="size-3" /> Obsidian</button><button className="flex items-center gap-1.5 text-[10px] text-zinc-500 hover:text-zinc-200"><Download className="size-3" /> .md</button></div></div>
            {tab === 'notes' && <Notes actions={actions} toggleAction={toggleAction} />}
            {tab === 'transcript' && <Transcript />}
            {tab === 'audio' && <AudioDebugger />}
          </div>
        </section>
      </div>
      {settingsOpen && <SettingsDrawer onClose={() => setSettingsOpen(false)} />}
      {sessionOpen && <SessionModal onClose={() => setSessionOpen(false)} />}
    </main>
  )
}

function Notes({ actions, toggleAction }: { actions: typeof initialActions; toggleAction: (id: number) => void }) {
  return <article className="max-w-[820px] pb-14"><div className="mb-8 border-l-2 border-violet-400/50 pl-5"><div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-300"><Sparkles className="size-3.5" /> Executive summary</div><p className="text-[15px] leading-7 text-zinc-300">The team aligned on a local-first architecture for Kame ERP&apos;s API layer. A dual-channel ingestion worker will normalize microphone and system audio before handing context to the local LLM runtime.</p></div><section className="mb-9"><SectionTitle index="01" title="Architecture decisions & trade-offs" /><div className="mt-4 rounded-lg border border-white/[0.08] bg-white/[0.02] p-5"><div className="mb-4 flex items-center gap-3"><Badge tone="violet">ADR-014</Badge><span className="text-[12px] font-semibold text-zinc-200">Local inference boundary</span><span className="ml-auto font-mono text-[9px] text-zinc-600">ACCEPTED</span></div><p className="mb-4 text-[12px] leading-6 text-zinc-400">Keep transcription and synthesis on-device through Ollama. The API only persists encrypted artifacts to SQLite, avoiding a network dependency during meetings.</p><div className="grid gap-3 sm:grid-cols-2"><Decision label="Decision" text="Ollama + faster-whisper" tone="emerald" /><Decision label="Trade-off" text="Higher local RAM usage" tone="amber" /></div></div></section><section className="mb-9"><SectionTitle index="02" title="Action items" meta="1 / 4 complete" /><div className="mt-4 divide-y divide-white/[0.06] rounded-lg border border-white/[0.08] bg-white/[0.02] px-4">{actions.map((action) => <label key={action.id} className="flex cursor-pointer items-center gap-3 py-3.5"><input type="checkbox" checked={action.done} onChange={() => toggleAction(action.id)} className="size-3.5 accent-violet-400" /><span className={`flex-1 text-[12px] ${action.done ? 'text-zinc-600 line-through' : 'text-zinc-300'}`}>{action.text}</span><span className="font-mono text-[10px] text-violet-300/70">{action.owner}</span></label>)}</div></section><section><SectionTitle index="03" title="Technical surface area" /><div className="mt-4 grid gap-3 sm:grid-cols-2"><CodeLine code="POST /api/v1/ingest" /><CodeLine code="webrtc://localhost:9001/loopback" /><CodeLine code="OLLAMA_HOST=127.0.0.1:11434" /><CodeLine code="model: llama3.1:8b" /></div></section></article>
}
function SectionTitle({ index, title, meta }: { index: string; title: string; meta?: string }) { return <div className="flex items-center gap-3"><span className="font-mono text-[10px] text-violet-400/70">{index}</span><h2 className="text-[13px] font-semibold tracking-tight text-zinc-200">{title}</h2>{meta && <span className="ml-auto font-mono text-[9px] text-zinc-600">{meta}</span>}</div> }
function Decision({ label, text, tone }: { label: string; text: string; tone: string }) { return <div className="rounded-md bg-black/20 p-3"><div className={`mb-1 text-[9px] uppercase tracking-wider ${tone === 'emerald' ? 'text-emerald-400' : 'text-amber-400'}`}>{label}</div><div className="font-mono text-[10px] text-zinc-400">{text}</div></div> }
function CodeLine({ code }: { code: string }) { return <div className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-black/20 px-3 py-3 font-mono text-[10px] text-violet-200/70"><Code2 className="size-3 text-zinc-700" />{code}</div> }
function Transcript() { return <div className="max-w-[850px]"><div className="mb-5 flex items-center gap-3 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2"><Search className="size-3.5 text-zinc-600" /><input className="flex-1 bg-transparent text-[11px] text-zinc-300 outline-none placeholder:text-zinc-600" placeholder="Search transcript..." /><kbd className="font-mono text-[9px] text-zinc-700">⌘ F</kbd></div><div className="space-y-2">{[['12:34','YOU','We should keep the inference boundary on the host machine.','violet'],['12:48','SYSTEM AUDIO','Agreed. That also gives us a clean failure mode when Ollama is unavailable.','sky'],['13:02','YOU','I will write up the ADR and include the memory requirements for the 8B model.','violet'],['13:18','SYSTEM AUDIO','Let’s use the loopback worker as a separate process so we can restart capture independently.','sky']].map(([time, speaker, text, tone]) => <div key={time} className="group grid grid-cols-[60px_110px_1fr] gap-4 rounded-lg border border-transparent px-3 py-4 hover:border-white/[0.06] hover:bg-white/[0.02]"><span className="font-mono text-[10px] text-zinc-600">{time}</span><span className={`text-[9px] font-semibold tracking-wider ${tone === 'violet' ? 'text-violet-300' : 'text-sky-300'}`}>{speaker}</span><p className="text-[12px] leading-5 text-zinc-400">{text}</p><button className="col-start-1 hidden text-zinc-700 group-hover:block" aria-label={`Play from ${time}`}><Play className="size-3" /></button></div>)}</div></div> }
function AudioDebugger() { return <div className="max-w-[900px]"><div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5"><div className="mb-5 flex items-center justify-between"><div><div className="mb-1 text-[12px] font-medium text-zinc-200">Dual-track waveform</div><div className="font-mono text-[9px] text-zinc-600">Kame ERP &amp; API Architecture Sync.wav · 48kHz stereo</div></div><button className="flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-[10px] text-zinc-400 hover:text-zinc-100"><Play className="size-3" /> Play</button></div><div className="relative h-40 overflow-hidden rounded-lg bg-black/30 px-3 py-5"><div className="absolute inset-x-0 top-1/2 border-t border-dashed border-white/[0.08]" />{[...Array(70)].map((_, i) => <div key={i} className="absolute bottom-1/2 w-[2px] bg-violet-400/70" style={{ left: `${i * 1.45}%`, height: `${12 + Math.abs(Math.sin(i * 1.8)) * 48}px`, transform: 'translateY(50%)' }} />)}{[...Array(70)].map((_, i) => <div key={i} className="absolute top-1/2 w-[2px] bg-sky-400/50" style={{ left: `${i * 1.45}%`, height: `${10 + Math.abs(Math.cos(i * 1.4)) * 34}px` }} />)}<div className="absolute bottom-0 left-[35%] top-0 w-px bg-violet-300 shadow-[0_0_12px_#a78bfa]" /></div><div className="mt-4 flex items-center justify-between font-mono text-[9px] text-zinc-600"><span>00:00</span><span>15:00</span><span>30:00</span><span>45:00</span></div><div className="mt-6 flex flex-wrap items-center gap-2"><span className="mr-2 flex items-center gap-2 text-[10px] text-zinc-500"><span className="size-2 rounded-sm bg-violet-400" /> Mic / You</span><span className="mr-auto flex items-center gap-2 text-[10px] text-zinc-500"><span className="size-2 rounded-sm bg-sky-400" /> System audio</span>{['1.0x','1.25x','1.5x','2.0x'].map((speed) => <button key={speed} className={`rounded border px-2 py-1 font-mono text-[9px] ${speed === '1.0x' ? 'border-violet-400/30 bg-violet-400/10 text-violet-300' : 'border-white/10 text-zinc-600 hover:text-zinc-300'}`}>{speed}</button>)}</div></div></div> }
function SettingsDrawer({ onClose }: { onClose: () => void }) { return <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm"><div className="h-full w-full max-w-[380px] border-l border-white/10 bg-[#101014] p-6 shadow-2xl"><div className="mb-8 flex items-center justify-between"><div><div className="text-[14px] font-semibold">Engine settings</div><div className="mt-1 font-mono text-[9px] text-zinc-600">LOCAL RUNTIME CONFIGURATION</div></div><button onClick={onClose} className="text-zinc-500 hover:text-zinc-200" aria-label="Close settings"><X className="size-4" /></button></div><div className="space-y-7"><Setting label="Whisper engine" value="faster-whisper-large-v3" options={['faster-whisper-small','faster-whisper-medium','faster-whisper-large-v3']} /><Setting label="Synthesis model" value="llama3.1:8b" options={['llama3.1:8b','qwen2.5-coder','mistral-nemo']} /><div><label className="mb-2 block text-[10px] font-medium text-zinc-400">Obsidian vault directory</label><div className="flex items-center gap-2 rounded-md border border-white/10 bg-black/20 px-3 py-2.5 font-mono text-[10px] text-zinc-500"><Archive className="size-3.5 text-zinc-600" />~/Documents/Obsidian/Work<span className="ml-auto text-violet-400">…</span></div></div><div className="rounded-md border border-emerald-400/15 bg-emerald-400/[0.04] p-3 text-[10px] leading-5 text-emerald-300/70">All models run through <span className="font-mono text-emerald-300">localhost:11434</span>. No transcript leaves this machine.</div></div></div></div> }
function Setting({ label, value, options }: { label: string; value: string; options: string[] }) { return <div><label className="mb-2 block text-[10px] font-medium text-zinc-400">{label}</label><div className="relative"><select defaultValue={value} className="w-full appearance-none rounded-md border border-white/10 bg-black/20 px-3 py-2.5 font-mono text-[10px] text-zinc-300 outline-none focus:border-violet-400/50">{options.map((option) => <option key={option}>{option}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-2.5 size-3.5 text-zinc-600" /></div></div> }
function SessionModal({ onClose }: { onClose: () => void }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"><div className="w-full max-w-[520px] rounded-xl border border-white/10 bg-[#111116] p-6 shadow-2xl"><div className="mb-7 flex items-start justify-between"><div><div className="mb-1 flex items-center gap-2 text-[15px] font-semibold"><span className="flex size-7 items-center justify-center rounded-md bg-violet-400/15 text-violet-300"><Ghost className="size-4" /></span>New Ghost Session</div><div className="font-mono text-[9px] text-zinc-600">CAPTURE HUD · 2 CHANNELS READY</div></div><button onClick={onClose} className="text-zinc-500 hover:text-zinc-200" aria-label="Close new session"><X className="size-4" /></button></div><div className="mb-6 grid gap-3 sm:grid-cols-2"><Meter label="Microphone (Host)" color="violet" /><Meter label="Loopback (System / Meet)" color="sky" /></div><div className="mb-6"><label className="mb-2 block text-[10px] font-medium text-zinc-400">Synthesis template</label><div className="grid grid-cols-2 gap-2">{['Architecture Review','Daily Standup','Brainstorming','Raw Transcript Only'].map((item, i) => <button key={item} className={`rounded-md border p-3 text-left text-[10px] ${i === 0 ? 'border-violet-400/40 bg-violet-400/10 text-violet-200' : 'border-white/[0.08] text-zinc-500 hover:bg-white/[0.03]'}`}><div className="mb-1 flex items-center justify-between"><span>{item}</span>{i === 0 && <Check className="size-3 text-violet-300" />}</div><span className="font-mono text-[8px] text-zinc-600">{i === 3 ? 'No LLM pass' : 'ADR + action items'}</span></button>)}</div></div><button onClick={onClose} className="flex w-full items-center justify-center gap-2 rounded-md bg-violet-500 py-2.5 text-[11px] font-semibold text-white hover:bg-violet-400"><Mic2 className="size-3.5" /> Start capturing</button></div></div> }
function Meter({ label, color }: { label: string; color: string }) { return <div className="rounded-lg border border-white/[0.08] bg-black/20 p-3"><div className="mb-3 flex items-center gap-2"><span className={`size-2 rounded-full ${color === 'violet' ? 'bg-violet-400' : 'bg-sky-400'}`} /><span className="text-[10px] text-zinc-400">{label}</span></div><div className="flex h-8 items-end gap-0.5">{[30,52,40,75,62,90,48,35,70,55,42,68,32,50,78,45,60,38,66,82,44,58].map((height, i) => <span key={i} className={`flex-1 rounded-t-sm ${color === 'violet' ? 'bg-violet-400/60' : 'bg-sky-400/60'}`} style={{ height: `${height}%` }} />)}</div><div className="mt-2 flex items-center justify-between font-mono text-[8px] text-zinc-600"><span>-60 dB</span><span>LIVE</span><span>0 dB</span></div></div> }
