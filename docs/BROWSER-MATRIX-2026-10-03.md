# Browser/audio matrix receipt

This is local runtime evidence for the prepared instrument, not deployment or human listening evidence.

## Run identity

- Observed at: `2026-10-03 23:18:15 UTC`
- Source head: `e1fa00e56b11a1e184c03a20509ad67eb7d2f30e`
- Browser route: Playwright CLI wrapper from the repository's `playwright` skill
- Local URL: `http://127.0.0.1:5198/`
- Vite API proxy target: `http://127.0.0.1:8798`
- Adapter state: no `MYTHOPHONE_AI_API_KEY` or `MYTHOPHONE_AI_MODEL`; configured-AI request was expected to fail closed.

## Desktop prepared-mode proof

- Initial snapshot exposed three prepared cards, three native audio elements, three patch download links, the on-screen keyboard, macros, recording controls, and the OfflineAudioContext proof action.
- Audio elements loaded as `readyState=4` with durations `2.433356`, `1.988685`, and `0.938685` seconds; the first source was `/audio/rain-cello-demo.wav` with `preload=metadata`.
- After the explicit **Enable audio** gesture, `A` produced the measured field state `1/8 voices`, `Note 60`, and the accessible label `Measured sound field: 1 active voices, brightness 52 percent, texture 28 percent, motion 12 percent.`
- The **Render audio check** action reported `Rendered Rain cello: 127,036 active samples.` with metrics `Finite`, peak `0.116`, RMS `0.0259`, estimated frequency `110.0 Hz`, and tail RMS `0.00283`.
- The first prepared WAV was also started through the browser audio element; after 250 ms its state was `paused=false`, `currentTime=1.857583`, `duration=2.433356`. This proves browser playback advanced; no human listening review was performed.

## Portable-take and lifecycle proof

- Started **Record performance**, held `A`, then clicked **Stop recording** before releasing the key. The UI reported `Recorded 2 performance events.` and exposed both **Export portable take** and **Export performance WAV**. The terminal event path therefore closed the held note before export.
- Started a second take, held `A`, and clicked **Sand bell** while recording. The active heading remained `Rain cello` and the status reported `Stop recording before changing the patch.`
- This directly exercises the patch-identity guard that prevents one bundle from containing events performed against different instruments.

## Configured-mode failure proof

- Switched to **Configured AI** and clicked **Ask sound designer**.
- The UI reported `AI request failed (provider_unconfigured); the current instrument is still playable.` and the server message `set MYTHOPHONE_AI_API_KEY and MYTHOPHONE_AI_MODEL on the server to enable configured AI mode`.
- The active prepared instrument and measured sound field remained present after the failure.

## Responsive proof

- Resized the same page to `390x844`.
- `window.innerWidth=390`.
- `.example-grid` resolved to one `316px` column.
- Native audio controls measured `286px` wide each.
- The mobile page retained the prepared examples, configured-mode controls, keyboard, recording controls, and audio proof panel.

## Limits

- This receipt proves a local browser runtime at the named head. It does not prove a public deployment, GitHub Pages adoption, a human listening review, or a credentialed provider completion.
- The Playwright session and local servers were closed after the run.
