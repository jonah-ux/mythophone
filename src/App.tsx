import { useCallback, useEffect, useRef, useState } from 'react'
import source from './presets.json'
import {
  createInstrument,
  renderPerformance,
  type AudioActivity,
  type MacroName,
  type RenderedAudioAnalysis,
  type VoiceHandle,
} from './audio'
import { exportPatch, importPatch, parsePatch } from './domain'
import type { Patch } from './domain'
import './App.css'

const presets = source.map(value => parsePatch(value))
const keyMap: Record<string, number> = { a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67, y: 68, h: 69, u: 70, j: 71, k: 72 }
const keyboard = [
  { name: 'C4', value: 60, key: 'A' }, { name: 'C♯4', value: 61, key: 'W', black: true },
  { name: 'D4', value: 62, key: 'S' }, { name: 'D♯4', value: 63, key: 'E', black: true },
  { name: 'E4', value: 64, key: 'D' }, { name: 'F4', value: 65, key: 'F' },
  { name: 'F♯4', value: 66, key: 'T', black: true }, { name: 'G4', value: 67, key: 'G' },
  { name: 'G♯4', value: 68, key: 'Y', black: true }, { name: 'A4', value: 69, key: 'H' },
  { name: 'A♯4', value: 70, key: 'U', black: true }, { name: 'B4', value: 71, key: 'J' },
  { name: 'C5', value: 72, key: 'K' },
]
const macroControls: Array<{ name: MacroName; label: string; hint: string }> = [
  { name: 'brightness', label: 'Brightness', hint: 'opens the filter' },
  { name: 'texture', label: 'Texture', hint: 'adds the air/noise layer' },
  { name: 'motion', label: 'Motion', hint: 'turns on pitch drift' },
]

function formatMetric(value: number | null) {
  return value === null ? '—' : value.toFixed(1)
}

export default function App() {
  const [preset, setPreset] = useState<Patch>(presets[0])
  const [audioReady, setAudioReady] = useState(false)
  const [sustain, setSustain] = useState(false)
  const [activity, setActivity] = useState<AudioActivity>({ activeVoices: 0, sustain: false, macroValues: presets[0].macros, lastNote: null })
  const [message, setMessage] = useState('Enable audio, then play with A W S E D F T G Y H U J K.')
  const [rendering, setRendering] = useState(false)
  const [renderStats, setRenderStats] = useState<RenderedAudioAnalysis | null>(null)
  const context = useRef<AudioContext | null>(null)
  const instrument = useRef<ReturnType<typeof createInstrument> | null>(null)
  const held = useRef(new Map<string, VoiceHandle>())
  const picker = useRef<HTMLInputElement>(null)
  const startVoiceRef = useRef<(token: string, note: number, velocity?: number) => Promise<void>>(async () => undefined)
  const endVoiceRef = useRef<(token: string) => void>(() => undefined)

  const syncActivity = useCallback(() => {
    const next = instrument.current?.activity() ?? { activeVoices: 0, sustain, macroValues: preset.macros, lastNote: null }
    setActivity(next)
  }, [preset, sustain])

  const enableAudio = useCallback(async () => {
    context.current ??= new AudioContext()
    await context.current.resume()
    if (!instrument.current) instrument.current = createInstrument(context.current, preset)
    setAudioReady(true)
    syncActivity()
    return instrument.current
  }, [preset, syncActivity])

  function choose(next: Patch) {
    // Compile first. If it fails, the existing instrument remains playable.
    const replacement = context.current ? createInstrument(context.current, next) : null
    const prior = instrument.current
    held.current.clear()
    instrument.current = replacement
    prior?.dispose()
    setPreset(next)
    setRenderStats(null)
    setMessage(`Prepared instrument: ${next.name}`)
    syncActivity()
  }

  const startVoice = useCallback(async (token: string, note: number, velocity = 0.84) => {
    if (held.current.has(token)) return
    try {
      const synth = await enableAudio()
      const voice = synth.noteOn(note, velocity)
      held.current.set(token, voice)
      syncActivity()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Audio unavailable')
    }
  }, [enableAudio, syncActivity])

  const endVoice = useCallback((token: string) => {
    held.current.get(token)?.release()
    held.current.delete(token)
    syncActivity()
  }, [syncActivity])

  useEffect(() => {
    startVoiceRef.current = startVoice
    endVoiceRef.current = endVoice
  }, [startVoice, endVoice])

  function stopAll() {
    instrument.current?.allNotesOff()
    held.current.clear()
    setSustain(false)
    syncActivity()
    setMessage('All voices released.')
  }

  function changeSustain(next: boolean) {
    setSustain(next)
    instrument.current?.setSustain(next)
    syncActivity()
    setMessage(next ? 'Sustain held. Release it to finish held voices.' : 'Sustain released.')
  }

  function changeMacro(name: MacroName, value: number) {
    const nextValue = Math.min(Math.max(value, 0), 1)
    setPreset(current => ({ ...current, macros: { ...current.macros, [name]: nextValue } }))
    instrument.current?.setMacro(name, nextValue)
    syncActivity()
  }

  function save() {
    const url = URL.createObjectURL(new Blob([exportPatch(preset)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${preset.id}.mythophone.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
    setMessage(`Exported ${preset.name} as a portable patch.`)
  }

  async function load(file?: File) {
    if (!file) return
    try {
      choose(importPatch(await file.text()))
    } catch (error) {
      setMessage(`Import refused: ${error instanceof Error ? error.message : 'invalid patch'}`)
    }
    if (picker.current) picker.current.value = ''
  }

  async function renderProof() {
    setRendering(true)
    setMessage('Rendering the current patch through OfflineAudioContext…')
    try {
      const result = await renderPerformance(preset, [
        { type: 'sustain', at: 0, value: true },
        { type: 'note-on', at: 0.04, note: 60, velocity: 0.82 },
        { type: 'note-off', at: 0.34, note: 60 },
        { type: 'note-on', at: 0.42, note: 64, velocity: 0.75 },
        { type: 'note-off', at: 0.76, note: 64 },
        { type: 'macro', at: 0.8, name: 'brightness', value: 0.78 },
        { type: 'note-on', at: 0.84, note: 67, velocity: 0.86 },
        { type: 'note-off', at: 1.25, note: 67 },
        { type: 'sustain', at: 1.3, value: false },
      ], { duration: 3 })
      setRenderStats(result.analysis)
      setMessage(`Rendered ${result.patch.name}: ${result.analysis.nonSilentSamples.toLocaleString()} active samples.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Offline render failed')
    } finally {
      setRendering(false)
    }
  }

  useEffect(() => {
    const active = held.current
    const stop = () => {
      instrument.current?.allNotesOff()
      active.clear()
      setSustain(false)
      setActivity(instrument.current?.activity() ?? { activeVoices: 0, sustain: false, macroValues: presets[0].macros, lastNote: null })
    }
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (key === 'escape') { stop(); return }
      if (event.repeat || event.ctrlKey || event.metaKey || active.has(key) || keyMap[key] === undefined) return
      event.preventDefault()
      void startVoiceRef.current(key, keyMap[key])
    }
    const up = (event: KeyboardEvent) => endVoiceRef.current(event.key.toLowerCase())
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', stop)
    return () => {
      stop()
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  useEffect(() => () => {
    instrument.current?.dispose()
    void context.current?.close()
  }, [])

  return <main>
    <header>
      <span className="eyebrow">MYTHOPHONE / PATCH ENGINE V1</span>
      <h1>Find a sound. Make it yours.</h1>
      <p>Describe a myth, inspect the bounded patch, then perform it with your hands.</p>
    </header>
    <div className="status"><strong>Prepared mode</strong> · no key required · patch compiler validates every graph before it can replace the active sound</div>

    <section className="panel instrument-panel">
      <div className="section-heading"><div><span className="eyebrow">CHOOSE A MYTH</span><h2>{preset.name}</h2><p>{preset.description}</p></div><span className="voice-meter">{activity.activeVoices}/{preset.voiceLimit} voices</span></div>
      <div className="actions">{presets.map(value => <button key={value.id} className={value.id === preset.id ? 'selected' : 'secondary'} onClick={() => choose(value)}>{value.name}</button>)}</div>
      <div className="engine-line"><span>{preset.oscillator.type} + {preset.subOscillator?.type ?? 'no sub'} + {Math.round(preset.noise.mix * 100)}% air</span><span>{preset.envelope.attack.toFixed(2)}s attack · {preset.envelope.release.toFixed(2)}s release</span></div>
      <button onClick={() => { void enableAudio().then(() => setMessage('Audio ready. Play the keys or your computer keyboard.')).catch(() => setMessage('Audio could not start.')) }}>{audioReady ? 'Audio enabled' : 'Enable audio'}</button>

      <div className="macro-grid" aria-label="Performance macros">
        {macroControls.map(control => <label key={control.name} className="macro"><span><strong>{control.label}</strong><small>{control.hint}</small></span><input aria-label={control.label} type="range" min="0" max="1" step="0.01" value={activity.macroValues[control.name] ?? preset.macros[control.name]} onChange={event => changeMacro(control.name, Number(event.target.value))} /><output>{Math.round((activity.macroValues[control.name] ?? preset.macros[control.name]) * 100)}%</output></label>)}
      </div>

      <div className="keyboard" aria-label="On-screen keyboard">
        {keyboard.map(key => <button key={key.value} className={key.black ? 'black-key' : 'white-key'} aria-label={`${key.name}, computer key ${key.key}`} onPointerDown={event => { event.preventDefault(); void startVoice(String(key.value), key.value) }} onPointerUp={() => endVoice(String(key.value))} onPointerLeave={() => endVoice(String(key.value))}><span>{key.name}</span><kbd>{key.key}</kbd></button>)}
      </div>

      <div className="transport"><label className="sustain-toggle"><input type="checkbox" checked={sustain} onChange={event => changeSustain(event.target.checked)} /> <span>Sustain</span></label><span className="activity">{activity.lastNote ? `Last note ${activity.lastNote}` : 'No note yet'} · {activity.activeVoices ? 'sound is moving' : 'ready to play'}</span><button className="secondary" onClick={stopAll}>All notes off <kbd>Esc</kbd></button></div>
      <p role="status" className="message">{message}</p>
    </section>

    <section className="panel proof-panel">
      <div className="section-heading"><div><span className="eyebrow">AUDIO PROOF</span><h2>Render the same patch offline</h2><p>This uses the browser's real OfflineAudioContext, then measures finite output, peak, RMS, pitch estimate, and tail energy.</p></div><button onClick={() => { void renderProof() }} disabled={rendering}>{rendering ? 'Rendering…' : 'Render audio check'}</button></div>
      {renderStats && <div className="metrics" aria-label="Rendered audio metrics"><div><strong>{renderStats.finite ? 'Finite' : 'Invalid'}</strong><small>samples</small></div><div><strong>{renderStats.peak.toFixed(3)}</strong><small>peak</small></div><div><strong>{renderStats.rms.toFixed(4)}</strong><small>RMS</small></div><div><strong>{formatMetric(renderStats.estimatedFrequency)} Hz</strong><small>zero-crossing estimate</small></div><div><strong>{renderStats.tailRms.toFixed(5)}</strong><small>tail RMS</small></div></div>}
    </section>

    <section className="panel tools-panel"><div className="actions"><button className="secondary" onClick={save}>Export patch</button><button className="secondary" onClick={() => picker.current?.click()}>Import patch</button><input ref={picker} type="file" accept="application/json,.json" hidden onChange={event => { void load(event.target.files?.[0]) }} /></div><details><summary>Inspect patch data</summary><pre>{JSON.stringify(preset, null, 2)}</pre></details></section>
    <footer>Keyboard: A W S E D F T G Y H U J K · pointer keys support press-and-hold · Space is reserved for future recording.</footer>
  </main>
}
