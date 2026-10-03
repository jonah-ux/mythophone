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

## Remaining release gates

1. Exercise one configured real provider through the server adapter, then render the returned patch and one scoped edit. Keep the live-provider claim separate from mocked adapter tests.
2. Run the broader browser/audio matrix on the named release environment and publish through the repository's release owner.
3. Record deployment/public-hosting state separately from local source and CI evidence.

The repository now contains a GitHub Pages workflow for the prepared no-key build. That workflow is source evidence only until the release owner merges it, GitHub Pages accepts the deployment, and a live URL is read back in the named browser environment.

The no-key prepared mode remains the honest baseline. A real configured provider must be exercised separately before live AI is described as verified.
