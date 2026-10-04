# Mythophone engine architecture

Mythophone is a small Vite/React/TypeScript browser application with independent npm dependencies and a lockfile. The playable slice is intentionally self-contained: it needs only a current browser with Web Audio and no account, server, private runtime, remote sample, or model credential.

## Data boundary

`src/domain.ts` defines the versioned `mythophone/patch/v1` format. A patch has a primary oscillator, an optional sub-oscillator, deterministic white noise, an ADSR envelope, a low-pass or band-pass filter, a bounded master level and voice limit, and three macro defaults. Zod strict objects reject unknown fields, non-finite numbers, unsupported node types, incompatible versions, excess voices, and out-of-range values before compilation. The importer upgrades the starter's smaller `mythophone/preset/v1` shape, while exports always use the patch format.

Performance events are compact validated data: `note-on`, `note-off`, `sustain`, and `macro`. They carry times within a bounded render window and never contain executable code, arbitrary graph references, remote URLs, or provider credentials.

## Patch compiler and performance engine

`src/audio.ts` owns both `compilePatch` and the supported graph compiler. Every voice is a small graph:

```text
oscillator ─┐
sub-oscillator ─┼─> filter ─> envelope ─> master
deterministic noise ─┘
```

The performance engine starts all sources on the audio clock, applies attack/decay/sustain levels, and schedules release ramps before stopping and disconnecting sources. Voice count is bounded by the patch; when the limit is reached the oldest voice is released so rapid play cannot accumulate unbounded nodes. `setSustain(false)` releases key-up voices, `allNotesOff` forces every voice into its release tail, and `dispose` releases and disconnects the master. Window blur and unmount call the same cleanup path.

Macros are smooth parameter changes on the existing graph:

- **Brightness** moves the filter cutoff inside the patch's safe range.
- **Texture** scales the white-noise layer.
- **Motion** changes a small LFO pitch drift.

The current patch is never swapped until the replacement has passed `PatchSchema` and the graph has been constructed. A failed import or future provider response can therefore be refused atomically.

## Offline rendering and proof

`renderPerformance` creates an `OfflineAudioContext`, uses the same `createInstrument` compiler, schedules the validated event list, and returns the rendered `AudioBuffer` plus `analyzeRenderedAudio` measurements. The UI exposes this as **Render audio check** so browser verification can inspect real finite samples, peak, RMS, a zero-crossing frequency estimate, non-silent sample count, and the final tail RMS. Unit tests cover the schema, compiler boundary, analysis contract, and event limits; the browser check covers the real audio graph.

This release does not claim zero latency, all-browser support, or commercial instrument quality. A broader browser matrix, listened-to audio examples, and a configured provider are part of the next slices.

## Future AI seam

The planned sound-designer adapter will live behind a server-side request/response boundary. A provider may return only validated patch data and a concise explanation. Provider timeouts, refusals, cancellation, unsupported data, and compile errors must leave the current patch and performance state intact. Secrets must never become `VITE_` variables, browser-bundled data, exported patches, recordings, screenshots, or committed logs.
