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

## Next coherent slices

1. Exercise one configured real provider through the server adapter, then render the returned patch and one scoped edit. Keep the live-provider claim separate from mocked adapter tests.
2. Exercise a credentialed provider canary and render the returned patch and one scoped edit.
3. Add release-quality browser/audio acceptance, downloadable rendered examples, accessibility and reduced-motion review, and fresh-clone setup evidence.

The no-key prepared mode remains the honest baseline. A real configured provider must be exercised separately before live AI is described as verified.
