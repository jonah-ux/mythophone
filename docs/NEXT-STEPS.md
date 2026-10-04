# First product build

## Delivered in the playable engine slice

- Versioned, strict `mythophone/patch/v1` compiler with bounded graph vocabulary and legacy starter import upgrade.
- Three distinct prepared instruments: Rain cello, Sand bell, and Mechanical dragon.
- Real Web Audio voices with oscillator/sub-oscillator/noise layers, attack/decay/sustain/release, voice stealing, sustain release, all-notes-off, blur cleanup, and disposal.
- Brightness, Texture, and Motion macros with smooth parameter ramps.
- Portable patch export/import with no model request.
- Shared live/offline compiler path plus a browser OfflineAudioContext render proof panel.
- Contract tests for schema rejection, event limits, compiler bounds, finite audio analysis, and prepared-patch distinction.
- Optional server-side sound-designer adapter with bounded request/response schemas, timeout/cancellation handling, scoped revision validation, and an explicit provider-unconfigured response.
- Patch history/revert, bounded performance recording, and WAV export through the shared offline compiler.
- Portable performance bundles that restore a validated patch and timed take before WAV rendering.
- Bounded patch share links that restore a validated instrument from the URL hash without a model request.

## Remaining release gates

1. Exercise one configured real provider through the server adapter, then render the returned patch and one scoped edit. Keep the live-provider claim separate from mocked adapter tests.
2. Merge the open release-state and adapter-error PRs through the governed owner route, then rerun the public browser readback against the resulting `main` head.
3. Keep the deployment/readback receipt fresh after any source or hosting change; the current public Pages deployment is recorded separately in [RELEASE-STATE.md](RELEASE-STATE.md).

The repository contains a GitHub Pages workflow for the prepared no-key build, and the current `main` head is deployed at [jonah-ux.github.io/mythophone](https://jonah-ux.github.io/mythophone/). The [browser/audio matrix receipt](BROWSER-MATRIX-2026-10-03.md) and [RELEASE-STATE.md](RELEASE-STATE.md) keep local, public, and provider evidence separate. Pages does not provide `/api/design`; a separately deployed adapter and provider credentials remain required for configured AI.

The no-key prepared mode remains the honest baseline. A real configured provider must be exercised separately before live AI is described as verified.
