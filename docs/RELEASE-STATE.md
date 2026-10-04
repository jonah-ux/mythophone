# Release state

This is a dated state record, not a release claim. Re-run the GitHub commands below before promoting a later revision.

## Observed 2026-10-03 22:38:51 UTC

- `gh release list --repo jonah-ux/mythophone --limit 10` returned no releases.
- `gh api repos/jonah-ux/mythophone/tags` returned no tags.
- `gh api repos/jonah-ux/mythophone/deployments` returned no deployment records.
- The open work is still represented by reviewable stacked pull requests; the prepared no-key experience is source and local-runtime evidence.
- Public hosting, merge, deployment, runtime adoption, and externally observed release behavior remain unclaimed until their owning release path supplies fresh evidence.

## Readback 2026-10-04 00:31:23 UTC

- PR #21 is merged into `codex/mythophone-origin-hardening` at `4506aee0818cc5625dd235f23e3cb9616235de2a` from source head `db16dc8df0f2b9adab6734263c1c202521ac9dfe`.
- PR #22 is merged into `codex/mythophone-share-clipboard-fallback` at `ca39b85cb9552706bdc38cfaaa73d798e7ed6fa6` from source head `438c557b129cec850e5114d52f080db8f18b3cdf`.
- PR #23 is merged into `codex/mythophone-pages-assets` at `18f52b894c161a9938944260b7a4f16c57cb594d` from source head `dce9a559d62515fe414ef2fe04a5dca381ec88e1`.
- The public `main` branch still reads `c871c71d7056d8aec4221c0a87abe22f5a1ecb4e`; these stacked parent-branch merges have not yet been adopted by `main`.
- Fresh GitHub readback returned no releases, `0` tags, and `0` deployment records. The Pages workflow therefore remains source evidence, not public-host evidence.

## Public readback 2026-10-04 01:06:09 UTC

- Public `main` reads `5b0e1ac978a1b5687def8540300cd84377a7526d`.
- GitHub Pages deployments `6835036211`, `6835082209`, and `6835085747` target environment `github-pages`; the latest deployment targets `5b0e1ac978a1b5687def8540300cd84377a7526d`.
- `https://jonah-ux.github.io/mythophone/` returned HTTP `200`; the real browser loaded all three prepared WAV files under `/mythophone/audio/` with `readyState=4` and durations `2.433356`, `1.988685`, and `0.938685` seconds.
- The public browser's **Render audio check** reported `Finite`, peak `0.116`, RMS `0.0259`, estimated frequency `110.0 Hz`, tail RMS `0.00283`, and `127,036` active samples.
- The static Pages frontend has no `/api/design` adapter. On the current `main` deployment, configured mode remains an explicit failure while the prepared patch and offline proof stay playable; PR #27 carries the follow-up classification for the HTML SPA fallback and is still held by the remote governed-merge receipt-writer gate.
- Fresh GitHub readback still shows no releases and `0` tags. Public hosting is now observed for `main`; credentialed provider completion and PR #27 error-classification adoption remain separate.

## Public readback 2026-10-04 14:09:41 UTC

- Public `main` reads `58ef327f197ea9a38d1167b7251052cb5396ed4d` after the governed merge of the non-JSON adapter refusal classification.
- Pages workflow run `37208060639` completed successfully against that head; the latest `github-pages` deployment record is `6842009080` targeting the same SHA.
- `https://jonah-ux.github.io/mythophone/` returned HTTP `200`. The real browser loaded all three prepared WAV files with `readyState=4` and durations `2.433356`, `1.988685`, and `0.938685` seconds.
- The public browser's **Render audio check** reported `Finite`, peak `0.116`, RMS `0.0259`, estimated frequency `110.0 Hz`, tail RMS `0.00283`, and `127,036` active samples. Enabling audio and clicking C4 showed `1/8 voice` and `Last note 60 · sound is moving`.
- In **Configured AI**, **Ask sound designer** received the static host's HTTP `405` HTML response. The visible status was `AI request failed (provider_refused); the current instrument is still playable.`, with the underlying message `sound-designer endpoint returned a non-JSON response`.
- This proves public adoption of the refusal classification and preserves the prepared no-key path. It does not prove a credentialed provider completion; `MYTHOPHONE_AI_API_KEY` and `MYTHOPHONE_AI_MODEL` remain absent in the available environment.

## Public readback 2026-10-04 15:01:17 UTC

- Public `main` reads `d1cc416bb1b3e5ec83dbdedae97d743d0a7b6de6`, the governed merge commit for the adapter-contract hardening PR.
- Pages workflow run `37211054554` completed successfully against that head; the latest `github-pages` deployment record is `6842540575` targeting the same SHA.
- Current-head source verification completed locally at `eb8f192a27e2ffeb6617701aba79b0593379e7cc`: lint, TypeScript, 25 Vitest tests, 8 Node contract tests, and the production build all passed.
- GitHub starter-check run `37211054544` also completed successfully for `d1cc416`. A separate post-push run `37211047946` failed before checkout completed because it attempted to fetch the absent governed candidate tag `fleet-pr-merge-candidate-d1cc416bb1b3e5ec83dbdedae97d743d0a7b6de6`; this is recorded as checkout/tag infrastructure failure, not a source-test result.
- The public browser rendered the prepared Rain cello patch as `Finite`, peak `0.116`, RMS `0.0259`, estimated frequency `110.0 Hz`, tail RMS `0.00283`, and `127,036` active samples. The three prepared examples remain exposed at `2.433356`, `1.988685`, and `0.938685` seconds.
- In **Configured AI**, **Ask sound designer** displayed `AI request failed (provider_refused); the current instrument is still playable.`, with the underlying message `sound-designer endpoint returned a non-JSON response`.
- The adapter contract now advertises `POST, OPTIONS` on CORS preflight, and browser-side pre-aborted or malformed requests are normalized before any provider dispatch. The credentialed provider canary remains unrun because provider configuration is absent.

## Recheck route

From an authenticated checkout, run:

```sh
GH_CONFIG_DIR=/path/to/authorized/gh-config gh release list --repo jonah-ux/mythophone --limit 10
GH_CONFIG_DIR=/path/to/authorized/gh-config gh api repos/jonah-ux/mythophone/tags
GH_CONFIG_DIR=/path/to/authorized/gh-config gh api repos/jonah-ux/mythophone/deployments
```

Keep the resulting source revision, deployment target, live URL, and visible behavior separate in the next release receipt.
