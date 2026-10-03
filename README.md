# Mythophone

[Source repository](https://github.com/jonah-ux/mythophone)

Invent an instrument, inspect its patch, and play it.

**Status: playable prepared engine.** Mythophone now has a versioned bounded patch compiler, three authored no-key instruments, expressive macros, sustain-aware voice cleanup, portable patch export/import, and a real browser OfflineAudioContext render check. The live sound-designer adapter is the next vertical slice.

## Hear it first

`sh
npm ci
npm run dev
`

Open http://127.0.0.1:5175, press **Enable audio**, and hold the on-screen keys or `A W S E D F T G Y H U J K`. Choose **Rain cello**, **Sand bell**, or **Mechanical dragon**, then move Brightness, Texture, and Motion while a note is held. `Esc` releases every voice. The **Render audio check** button renders the same patch through the browser's real `OfflineAudioContext` and reports finite samples, peak, RMS, pitch estimate, and tail RMS.

No model credentials or private service are required for this mode. The prepared patches are labeled as prepared; they are not represented as fresh model output.

## Checks

`sh
npm run verify
`

This runs oxlint, TypeScript, nine focused schema/engine contract tests, and the production build. The browser render check is additional runtime evidence because a Node unit test or a mocked `AudioContext` cannot prove that a real browser graph produces finite audio.

## Engine shape

- `src/domain.ts` owns the strict `mythophone/patch/v1` schema, legacy starter upgrade, compact performance events, and JSON import/export limits.
- `src/audio.ts` owns `compilePatch`, the live Web Audio graph, voice envelopes, voice stealing, sustain, macro ramps, deterministic noise, offline rendering, and rendered-buffer analysis.
- `src/presets.json` contains three original prepared patches: a sustained airy texture, a struck noisy decay, and a bright mechanical growl.
- `src/App.tsx` owns the actual keyboard/pointer performance surface and the visible audio proof metrics.

The compiler accepts only bounded oscillator, optional sub-oscillator, white-noise, envelope, filter, macro, gain, and voice-limit data. It rejects incompatible versions, unsupported node types, unknown fields, non-finite values, excessive voices, oversized imports, and arbitrary graph/code payloads before a patch can replace the active instrument. A failed import or future provider response therefore leaves the current instrument playable.

The same compiler and event semantics feed live playback and `renderPerformance`. A render includes note-on/note-off, sustain, and macro events, then measures signal energy and the release tail. The first release uses a short deterministic noise buffer rather than remote samples, and keeps the documented engine limits small enough for an ordinary browser.

## Portable patches

Use **Export patch** to save a `.mythophone.json` file. Import validates and upgrades the original starter `mythophone/preset/v1` shape without requesting a model. Patch data contains no credentials, URLs, executable code, AudioWorklet source, or provider history.

## Next slice

The remaining product work is the server-side sound-designer adapter, patch history/revert, performance recording, WAV export, and broader browser/audio acceptance. See [docs/NEXT-STEPS.md](docs/NEXT-STEPS.md) and the complete [build prompt](docs/BUILD-PROMPT.md).

## Provenance and limits

The starter uses the official Vite React/TypeScript template and public dependencies recorded in the lockfile. Prepared patch data, engine behavior, and UI changes were authored with AI assistance. This project does not claim physically realistic cello, bell, rain, sand, or dragon synthesis; those names describe bounded artistic interpretations. Audio quality, latency, and browser compatibility still need broader measurement before a release claim. [MIT license](LICENSE).
