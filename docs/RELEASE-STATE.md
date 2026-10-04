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

## Recheck route

From an authenticated checkout, run:

```sh
GH_CONFIG_DIR=/path/to/authorized/gh-config gh release list --repo jonah-ux/mythophone --limit 10
GH_CONFIG_DIR=/path/to/authorized/gh-config gh api repos/jonah-ux/mythophone/tags
GH_CONFIG_DIR=/path/to/authorized/gh-config gh api repos/jonah-ux/mythophone/deployments
```

Keep the resulting source revision, deployment target, live URL, and visible behavior separate in the next release receipt.
