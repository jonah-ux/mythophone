# Mythophone

[Source repository](https://github.com/jonah-ux/mythophone)

Invent an instrument, inspect its patch, and play it.

**Status: portable playable engine with an optional sound-designer adapter.** Mythophone has a versioned bounded patch compiler, three authored no-key instruments, expressive macros, sustain-aware voice cleanup, portable patch export/import, patch history/revert, compact performance recording, PCM WAV export, a real browser OfflineAudioContext render check, and a server-side provider boundary that fails closed when it is unconfigured.

## Hear it first

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5175, press **Enable audio**, and hold the on-screen keys or `A W S E D F T G Y H U J K`. Choose **Rain cello**, **Sand bell**, or **Mechanical dragon**, then move Brightness, Texture, and Motion while a note is held. `Esc` releases every voice. The **Render audio check** button renders the same patch through the browser's real `OfflineAudioContext` and reports finite samples, peak, RMS, pitch estimate, and tail RMS.

No model credentials or private service are required for this mode. The prepared patches are labeled as prepared; they are not represented as fresh model output.

### Prepared audio examples

These short mono PCM/WAV examples were rendered from the prepared patches through the browser's offline path and checked as finite files. They are included as inspectable artifacts; this run measured them but did not perform a listening review.

- [Rain cello demo](public/audio/rain-cello-demo.wav) · 2.433 seconds at 44.1 kHz
- [Sand bell demo](public/audio/sand-bell-demo.wav) · 1.989 seconds at 44.1 kHz
- [Mechanical dragon demo](public/audio/mechanical-dragon-demo.wav) · 0.939 seconds at 44.1 kHz

## Checks

```sh
npm run verify
```

This runs oxlint, TypeScript, focused schema/engine/designer tests, server adapter tests, and the production build. The browser render check is additional runtime evidence because a Node unit test or a mocked `AudioContext` cannot prove that a real browser graph produces finite audio.

## Engine shape

- `src/domain.ts` owns the strict `mythophone/patch/v1` schema, legacy starter upgrade, compact performance events, and JSON import/export limits.
- `src/audio.ts` owns `compilePatch`, the live Web Audio graph, voice envelopes, voice stealing, sustain, macro ramps, deterministic noise, offline rendering, and rendered-buffer analysis.
- `src/presets.json` contains three original prepared patches: a sustained airy texture, a struck noisy decay, and a bright mechanical growl.
- `src/App.tsx` owns the actual keyboard/pointer performance surface and the visible audio proof metrics.
- `src/designer.ts` owns the browser request schema, timeout/cancellation handling, response validation, and scoped-revision guard.
- `server/design-adapter.mjs` owns the optional OpenAI-compatible provider call. Credentials stay in server environment variables and never enter the Vite bundle.

The compiler accepts only bounded oscillator, optional sub-oscillator, white-noise, envelope, filter, macro, gain, and voice-limit data. It rejects incompatible versions, unsupported node types, unknown fields, non-finite values, excessive voices, oversized imports, and arbitrary graph/code payloads before a patch can replace the active instrument. A failed import or future provider response therefore leaves the current instrument playable.

The same compiler and event semantics feed live playback and `renderPerformance`. A render includes note-on/note-off, sustain, and macro events, then measures signal energy and the release tail. The first release uses a short deterministic noise buffer rather than remote samples, and keeps the documented engine limits small enough for an ordinary browser.

The performance panel includes a measured sound field. Its accessible label reports active voice count and current macro values; the visual orb and rings use those same engine readings, so the visual layer stays tied to actual performance state rather than pretending to be an audio waveform.

## Portable performances

Use **Record performance** while playing notes or moving macros, then stop to capture a validated `mythophone/performance/v1` event list. Recording starts after the audio context is enabled and uses the audio clock, so the event timeline matches the same clock used for note scheduling. **Export portable take** saves a strict `mythophone/performance-bundle/v1` JSON file containing the validated patch and timed performance; **Import portable take** restores both without another model request. **Export performance WAV** renders that restored event list through the same OfflineAudioContext compiler and writes a normal 16-bit PCM RIFF/WAVE file. Patch selections are retained in a short history; **Revert patch** restores the last successfully compiled patch without requesting a model.

## Configured AI mode

Start the local adapter in a second terminal:

`sh
cp .env.example .env
# set MYTHOPHONE_AI_API_KEY and MYTHOPHONE_AI_MODEL in the server environment
npm run api
`

Then run `npm run dev`, switch the UI from **Prepared** to **Configured AI**, and choose **New instrument** or **Refine current patch**. The browser sends a bounded `mythophone/design-request/v1` payload to `/api/design`. The server asks one OpenAI-compatible provider for JSON, validates `mythophone/design-response/v1`, and refuses any response that changes an undeclared path. A provider refusal, timeout, cancellation, oversized response, invalid graph, or missing configuration leaves the current playable patch in place.

The adapter is provider-shaped but provider-agnostic. This repository does not claim a live provider completion until a real credentialed request has been exercised and its returned patch has been rendered.

## Portable patches

Use **Export patch** to save a `.mythophone.json` file. Import validates and upgrades the original starter `mythophone/preset/v1` shape without requesting a model. Patch data contains no credentials, URLs, executable code, AudioWorklet source, or provider history.

## Release path

The playable, portable, and measured no-key path is implemented. The remaining release gate is a credentialed provider canary plus the broader browser/audio matrix and release-owner publication. See [docs/NEXT-STEPS.md](docs/NEXT-STEPS.md), [docs/RELEASE-CHECKLIST.md](docs/RELEASE-CHECKLIST.md), and the complete [build prompt](docs/BUILD-PROMPT.md).

## Provenance and limits

The starter uses the official Vite React/TypeScript template and public dependencies recorded in the lockfile. Prepared patch data, engine behavior, and UI changes were authored with AI assistance. This project does not claim physically realistic cello, bell, rain, sand, or dragon synthesis; those names describe bounded artistic interpretations. Audio quality, latency, and browser compatibility still need broader measurement before a release claim. [MIT license](LICENSE).
