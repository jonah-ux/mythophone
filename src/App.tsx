import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
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
import { DesignError, requestDesign } from './designer'
import { createPerformanceRecorder, exportPerformanceBundle, importPerformanceBundle, type PerformanceRecording } from './recording'
import { downloadWav } from './wav'
import { compilePatch } from './audio'
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
const preparedExamples = [
  { name: 'Rain cello', id: 'rain-cello', file: '/audio/rain-cello-demo.wav', patch: '/patches/rain-cello.mythophone.json', duration: '2.433s', description: 'sustained airy texture' },
  { name: 'Sand bell', id: 'sand-bell', file: '/audio/sand-bell-demo.wav', patch: '/patches/sand-bell.mythophone.json', duration: '1.989s', description: 'struck tone into a dry tail' },
  { name: 'Mechanical dragon', id: 'mechanical-dragon', file: '/audio/mechanical-dragon-demo.wav', patch: '/patches/mechanical-dragon.mythophone.json', duration: '0.939s', description: 'playful square-metal growl' },
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
  const [designMode, setDesignMode] = useState<'prepared' | 'configured'>('prepared')
  const [designRequestMode, setDesignRequestMode] = useState<'generate' | 'edit'>('generate')
  const [designPrompt, setDesignPrompt] = useState('A cello made of rain.')
  const [designing, setDesigning] = useState(false)
  const [designerStatus, setDesignerStatus] = useState('Prepared patches are available without a provider key.')
  const [patchHistory, setPatchHistory] = useState<Patch[]>([])
  const [recording, setRecording] = useState<PerformanceRecording | null>(null)
  const [recordingPatch, setRecordingPatch] = useState<Patch | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [exportingWav, setExportingWav] = useState(false)
  const context = useRef<AudioContext | null>(null)
  const instrument = useRef<ReturnType<typeof createInstrument> | null>(null)
  const held = useRef(new Map<string, VoiceHandle>())
  const picker = useRef<HTMLInputElement>(null)
  const performancePicker = useRef<HTMLInputElement>(null)
  const designAbort = useRef<AbortController | null>(null)
  const [recorder] = useState(() => createPerformanceRecorder())
  const recordingPatchRef = useRef<Patch | null>(null)
  const fieldStyle = {
    '--energy': String(Math.min(activity.activeVoices / Math.max(preset.voiceLimit, 1), 1)),
    '--brightness': String(activity.macroValues.brightness),
    '--texture': String(activity.macroValues.texture),
    '--motion': String(activity.macroValues.motion),
  } as CSSProperties
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
    const compiled = compilePatch(next)
    const replacement = context.current ? createInstrument(context.current, compiled) : null
    const prior = instrument.current
    held.current.clear()
    instrument.current = replacement
    prior?.dispose()
    setPatchHistory(history => [...history.slice(-7), preset])
    setPreset(compiled)
    setActivity(replacement?.activity() ?? { activeVoices: 0, sustain: false, macroValues: compiled.macros, lastNote: null })
    setRenderStats(null)
    setMessage(`Prepared instrument: ${next.name}`)
  }

  const startVoice = useCallback(async (token: string, note: number, velocity = 0.84) => {
    if (held.current.has(token)) return
    try {
      const synth = await enableAudio()
      const voice = synth.noteOn(note, velocity)
      held.current.set(token, voice)
      recorder.push({ type: 'note-on', note, velocity }, context.current?.currentTime)
      syncActivity()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Audio unavailable')
    }
  }, [enableAudio, recorder, syncActivity])

  const endVoice = useCallback((token: string) => {
    const voice = held.current.get(token)
    voice?.release()
    if (voice) recorder.push({ type: 'note-off', note: voice.note }, context.current?.currentTime)
    held.current.delete(token)
    syncActivity()
  }, [recorder, syncActivity])

  useEffect(() => {
    startVoiceRef.current = startVoice
    endVoiceRef.current = endVoice
  }, [startVoice, endVoice])

  function stopAll() {
    instrument.current?.allNotesOff()
    held.current.clear()
    const currentRecording = recorder.stop(context.current?.currentTime)
    if (currentRecording.events.length > 0) {
      setRecording(currentRecording)
      setRecordingPatch(recordingPatchRef.current ?? preset)
    }
    setIsRecording(false)
    setSustain(false)
    syncActivity()
    setMessage('All voices released.')
  }

  function changeSustain(next: boolean) {
    setSustain(next)
    instrument.current?.setSustain(next)
    recorder.push({ type: 'sustain', value: next }, context.current?.currentTime)
    syncActivity()
    setMessage(next ? 'Sustain held. Release it to finish held voices.' : 'Sustain released.')
  }

  function changeMacro(name: MacroName, value: number) {
    const nextValue = Math.min(Math.max(value, 0), 1)
    setPreset(current => ({ ...current, macros: { ...current.macros, [name]: nextValue } }))
    instrument.current?.setMacro(name, nextValue)
    recorder.push({ type: 'macro', name, value: nextValue }, context.current?.currentTime)
    if (instrument.current) syncActivity()
    else setActivity(current => ({ ...current, macroValues: { ...current.macroValues, [name]: nextValue } }))
  }

  async function runDesign() {
    designAbort.current?.abort()
    const controller = new AbortController()
    designAbort.current = controller
    setDesigning(true)
    setDesignerStatus('Sending a bounded request to the server-side sound designer…')
    try {
      const result = await requestDesign(designRequestMode, designPrompt, preset, { signal: controller.signal })
      choose(result.patch)
      setMessage('AI interpretation: ' + result.explanation)
      setDesignerStatus('Validated patch applied. Changed: ' + (result.changedPaths.join(', ') || 'none declared') + '.')
    } catch (error) {
      const code = error instanceof DesignError ? error.code : 'provider_refused'
      setDesignerStatus('AI request failed (' + code + '); the current instrument is still playable.')
      setMessage(error instanceof Error ? error.message : 'Sound designer unavailable')
    } finally {
      if (designAbort.current === controller) designAbort.current = null
      setDesigning(false)
    }
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

  async function toggleRecording() {
    if (recorder.isRecording()) {
      const next = recorder.stop(context.current?.currentTime)
      setRecording(next)
      setRecordingPatch(recordingPatchRef.current ?? preset)
      setIsRecording(false)
      setMessage('Recorded ' + next.events.length + ' performance events.')
      return
    }
    try {
      await enableAudio()
      recorder.start(context.current?.currentTime)
      recordingPatchRef.current = preset
      setRecordingPatch(preset)
      setRecording(null)
      setIsRecording(true)
      setMessage('Recording performance on the audio clock. Play notes, move macros, then stop recording.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Audio unavailable')
    }
  }

  function revertPatch() {
    const previous = patchHistory.at(-1)
    if (!previous) return
    setPatchHistory(history => history.slice(0, -1))
    const replacement = context.current ? createInstrument(context.current, previous) : null
    const prior = instrument.current
    held.current.clear()
    instrument.current = replacement
    prior?.dispose()
    setPreset(previous)
    setActivity(replacement?.activity() ?? { activeVoices: 0, sustain: false, macroValues: previous.macros, lastNote: null })
    setRenderStats(null)
    setMessage('Reverted to ' + previous.name + '.')
  }

  async function exportRecordingWav() {
    const saved = recording ?? recorder.getRecording()
    if (saved.events.length === 0) {
      setMessage('Record a performance before exporting WAV.')
      return
    }
    setExportingWav(true)
    try {
      const sourcePatch = recordingPatch ?? preset
      const result = await renderPerformance(sourcePatch, saved.events, { duration: saved.duration + sourcePatch.envelope.release + 0.1 })
      downloadWav(result.buffer, sourcePatch.id + '-performance.wav')
      setMessage('Exported ' + sourcePatch.name + ' performance as WAV.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'WAV export failed')
    } finally {
      setExportingWav(false)
    }
  }

  function saveRecording() {
    const saved = recording ?? recorder.getRecording()
    if (saved.events.length === 0) {
      setMessage('Record a performance before exporting a portable take.')
      return
    }
    const sourcePatch = recordingPatch ?? preset
    const url = URL.createObjectURL(new Blob([exportPerformanceBundle(sourcePatch, saved)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${sourcePatch.id}-performance.mythophone.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
    setMessage(`Exported ${sourcePatch.name} performance and patch bundle.`)
  }

  async function loadRecording(file?: File) {
    if (!file) return
    try {
      if (recorder.isRecording()) throw new Error('stop recording before importing a performance')
      const bundle = importPerformanceBundle(await file.text())
      choose(bundle.patch)
      recordingPatchRef.current = bundle.patch
      setRecordingPatch(bundle.patch)
      setRecording(bundle.recording)
      setIsRecording(false)
      setMessage(`Imported ${bundle.recording.events.length} events for ${bundle.patch.name}.`)
    } catch (error) {
      setMessage(`Performance import refused: ${error instanceof Error ? error.message : 'invalid performance bundle'}`)
    }
    if (performancePicker.current) performancePicker.current.value = ''
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
    designAbort.current?.abort()
    instrument.current?.dispose()
    void context.current?.close()
  }, [])

  return <main>
    <header>
      <span className="eyebrow">MYTHOPHONE / PATCH ENGINE V1</span>
      <h1>Find a sound. Make it yours.</h1>
      <p>Describe a myth, inspect the bounded patch, then perform it with your hands.</p>
    </header>
    <div className="status"><strong>{designMode === 'prepared' ? 'Prepared mode' : 'Configured AI mode'}</strong> · {designMode === 'prepared' ? 'no key required; these patches are authored examples' : 'provider is optional; keys stay on the server'} · patch compiler validates every graph before it can replace the active sound</div>
    <section className="panel examples-panel"><div className="section-heading"><div><span className="eyebrow">HEAR THE PREPARED PATCHES</span><h2>Three bounded interpretations</h2><p>These short mono WAVs were rendered from the prepared patches through the offline path. This page exposes both files for listening and canonical patch JSON for inspection or import.</p></div><span className="voice-meter">44.1 kHz · mono</span></div><div className="example-grid">{preparedExamples.map(example => <article key={example.id} className="example-card"><div><strong>{example.name}</strong><small>{example.description} · {example.duration}</small></div><audio controls preload="metadata" src={example.file} aria-label={example.name + ' prepared audio example'} /><a className="example-download" href={example.patch} download={`${example.id}.mythophone.json`}>Download patch JSON</a></article>)}</div></section>

    <section className="panel designer-panel">
      <div className="section-heading"><div><span className="eyebrow">DESCRIBE A MYTH</span><h2>Sound designer</h2><p>{designMode === 'prepared' ? 'Try the no-key instruments first, then opt into a configured provider when you are ready.' : 'The browser sends only a bounded prompt and current patch to /api/design. Provider output is validated before it can replace the active instrument.'}</p></div><div className="mode-actions"><button className={designMode === 'prepared' ? 'selected' : 'secondary'} onClick={() => setDesignMode('prepared')}>Prepared</button><button className={designMode === 'configured' ? 'selected' : 'secondary'} onClick={() => setDesignMode('configured')}>Configured AI</button></div></div>
      {designMode === 'configured' && <><div className="designer-controls"><div className="request-mode"><button className={designRequestMode === 'generate' ? 'selected' : 'secondary'} onClick={() => setDesignRequestMode('generate')}>New instrument</button><button className={designRequestMode === 'edit' ? 'selected' : 'secondary'} onClick={() => setDesignRequestMode('edit')}>Refine current patch</button></div><label className="prompt-field"><span>Direction</span><textarea aria-label="Sound design direction" value={designPrompt} maxLength={240} onChange={event => setDesignPrompt(event.target.value)} /></label><button onClick={() => { void runDesign() }} disabled={designing || designPrompt.trim().length < 3}>{designing ? 'Designing…' : 'Ask sound designer'}</button></div><p role="status" className="designer-status">{designerStatus}</p></>}
    </section>

    <section className="panel instrument-panel">
      <div className="section-heading"><div><span className="eyebrow">CHOOSE A MYTH</span><h2>{preset.name}</h2><p>{preset.description}</p></div><span className="voice-meter">{activity.activeVoices}/{preset.voiceLimit} voices</span></div>
      <div className="sound-field" style={fieldStyle} role="img" aria-label={'Measured sound field: ' + activity.activeVoices + ' active voices, brightness ' + Math.round(activity.macroValues.brightness * 100) + ' percent, texture ' + Math.round(activity.macroValues.texture * 100) + ' percent, motion ' + Math.round(activity.macroValues.motion * 100) + ' percent.'}><span className="sound-field-orb" /><span className="sound-field-ring ring-one" /><span className="sound-field-ring ring-two" /><span className="sound-field-label">{activity.lastNote ? 'Note ' + activity.lastNote : 'Ready'} · measured engine activity</span></div>
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
      <div className="recording-bar"><button className={isRecording ? 'recording' : 'secondary'} onClick={toggleRecording}>{isRecording ? 'Stop recording' : 'Record performance'}</button><span>{recording ? recording.events.length + ' events captured' : 'Record notes and macro moves for a portable take.'}</span></div>
      <p role="status" className="message">{message}</p>
    </section>

    <section className="panel proof-panel">
      <div className="section-heading"><div><span className="eyebrow">AUDIO PROOF</span><h2>Render the same patch offline</h2><p>This uses the browser's real OfflineAudioContext, then measures finite output, peak, RMS, pitch estimate, and tail energy.</p></div><button onClick={() => { void renderProof() }} disabled={rendering}>{rendering ? 'Rendering…' : 'Render audio check'}</button></div>
      {renderStats && <div className="metrics" aria-label="Rendered audio metrics"><div><strong>{renderStats.finite ? 'Finite' : 'Invalid'}</strong><small>samples</small></div><div><strong>{renderStats.peak.toFixed(3)}</strong><small>peak</small></div><div><strong>{renderStats.rms.toFixed(4)}</strong><small>RMS</small></div><div><strong>{formatMetric(renderStats.estimatedFrequency)} Hz</strong><small>zero-crossing estimate</small></div><div><strong>{renderStats.tailRms.toFixed(5)}</strong><small>tail RMS</small></div></div>}
    </section>

    <section className="panel tools-panel"><div className="actions"><button className="secondary" onClick={save}>Export patch</button><button className="secondary" onClick={() => picker.current?.click()}>Import patch</button><button className="secondary" onClick={revertPatch} disabled={patchHistory.length === 0}>Revert patch</button><button className="secondary" onClick={saveRecording} disabled={isRecording || !(recording?.events.length)}>Export portable take</button><button className="secondary" onClick={() => performancePicker.current?.click()} disabled={isRecording}>Import portable take</button><button className="secondary" onClick={() => { void exportRecordingWav() }} disabled={exportingWav || isRecording || !(recording?.events.length)}>{exportingWav ? 'Rendering WAV…' : 'Export performance WAV'}</button><input ref={picker} type="file" accept="application/json,.json" hidden onChange={event => { void load(event.target.files?.[0]) }} /><input ref={performancePicker} type="file" accept="application/json,.json" hidden onChange={event => { void loadRecording(event.target.files?.[0]) }} /></div><details><summary>Inspect patch data</summary><pre>{JSON.stringify(preset, null, 2)}</pre></details>{recording && <details><summary>Inspect recorded events ({recording.events.length})</summary><pre>{JSON.stringify(recording, null, 2)}</pre></details>}<p className="tool-hint">Portable takes bundle the validated patch with the timed performance, so another browser can restore the instrument before rendering its WAV.</p></section>
    <footer>Keyboard: A W S E D F T G Y H U J K · pointer keys support press-and-hold · Space is reserved for future recording.</footer>
  </main>
}
