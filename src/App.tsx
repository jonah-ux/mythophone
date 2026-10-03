import { useEffect, useRef, useState } from 'react'
import source from './presets.json'
import { createInstrument } from './audio'
import { exportPreset, importPreset, PresetSchema } from './domain'
import type { Preset } from './domain'
import './App.css'

const presets = source.map(value => PresetSchema.parse(value))
const keys: Record<string, number> = { a: 60, s: 62, d: 64, f: 65, g: 67, h: 69, j: 71, k: 72 }
const notes = [{ name: 'C4', value: 60 }, { name: 'E4', value: 64 }, { name: 'G4', value: 67 }, { name: 'C5', value: 72 }]

export default function App() {
  const [preset, setPreset] = useState(presets[0])
  const [audioReady, setAudioReady] = useState(false)
  const [message, setMessage] = useState('Enable audio, then play with A S D F G H J K.')
  const context = useRef<AudioContext | null>(null)
  const instrument = useRef<ReturnType<typeof createInstrument> | null>(null)
  const held = useRef(new Map<string, { release: (at?: number) => void }>())
  const picker = useRef<HTMLInputElement>(null)

  async function enableAudio() {
    context.current ??= new AudioContext()
    await context.current.resume()
    instrument.current ??= createInstrument(context.current, preset)
    setAudioReady(true)
    return instrument.current
  }
  function choose(next: Preset) {
    instrument.current?.dispose()
    held.current.clear()
    instrument.current = context.current ? createInstrument(context.current, next) : null
    setPreset(next)
    setMessage(`Prepared instrument: ${next.name}`)
  }
  async function play(note: number, name: string) {
    try {
      const synth = await enableAudio()
      const voice = synth.noteOn(note)
      voice.release(context.current!.currentTime + 0.35)
      setMessage(`Played ${name} with ${synth.preset.name}.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Audio unavailable') }
  }
  function save() {
    const url = URL.createObjectURL(new Blob([exportPreset(preset)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url; link.download = `${preset.id}.json`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
  async function load(file?: File) {
    if (!file) return
    try { if (file.size > 8192) throw new Error('Preset exceeds starter size limit'); choose(importPreset(await file.text())) }
    catch (error) { setMessage(`Import refused: ${error instanceof Error ? error.message : 'invalid preset'}`) }
    if (picker.current) picker.current.value = ''
  }
  useEffect(() => {
    const active = held.current
    const stop = () => { instrument.current?.allNotesOff(); active.clear() }
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (key === 'escape') { stop(); return }
      if (!audioReady || event.repeat || event.ctrlKey || event.metaKey || active.has(key) || keys[key] === undefined) return
      event.preventDefault()
      try { const voice = instrument.current!.noteOn(keys[key]); active.set(key, voice) }
      catch (error) { setMessage(error instanceof Error ? error.message : 'Audio unavailable') }
    }
    const up = (event: KeyboardEvent) => { const key = event.key.toLowerCase(); active.get(key)?.release(); active.delete(key) }
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', stop)
    return () => { stop(); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', stop) }
  }, [audioReady])
  useEffect(() => () => { instrument.current?.dispose(); void context.current?.close() }, [])

  return <main>
    <header><span className="eyebrow">MYTHOPHONE / PLAYABLE SYNTH STARTER</span><h1>Find a sound. Make it yours.</h1><p>Three prepared instruments and a real browser audio engine.</p></header>
    <div className="status">Prepared presets · AI instrument design is not implemented</div>
    <section className="panel"><div className="actions">{presets.map(value => <button key={value.id} className={value.id === preset.id ? 'selected' : 'secondary'} onClick={() => choose(value)}>{value.name}</button>)}</div>
      <h2>{preset.name}</h2><p>{preset.oscillator} voice · {preset.attack}s attack · {preset.release}s release</p>
      <button onClick={() => { void enableAudio().then(() => setMessage('Audio ready. Play A S D F G H J K.')).catch(() => setMessage('Audio could not start.')) }}>{audioReady ? 'Audio enabled' : 'Enable audio'}</button>
      <div className="keyboard">{notes.map(note => <button key={note.value} onClick={() => { void play(note.value, note.name) }}>{note.name}</button>)}</div>
      <p role="status">{message}</p><div className="actions"><button className="secondary" onClick={() => instrument.current?.allNotesOff()}>All notes off</button><button className="secondary" onClick={save}>Export preset</button><button className="secondary" onClick={() => picker.current?.click()}>Import preset</button><input ref={picker} type="file" accept="application/json,.json" hidden onChange={event => { void load(event.target.files?.[0]) }} /></div>
    </section>
    <footer>Next: AI-designed patches, expressive macros, patch history and performance recording. Read docs/BUILD-PROMPT.md.</footer>
  </main>
}
