# Release state

This is a dated state record, not a release claim. Re-run the GitHub commands below before promoting a later revision.

## Observed 2026-10-03 22:38:51 UTC

- `gh release list --repo jonah-ux/mythophone --limit 10` returned no releases.
- `gh api repos/jonah-ux/mythophone/tags` returned no tags.
- `gh api repos/jonah-ux/mythophone/deployments` returned no deployment records.
- The open work is still represented by reviewable stacked pull requests; the prepared no-key experience is source and local-runtime evidence.
- Public hosting, merge, deployment, runtime adoption, and externally observed release behavior remain unclaimed until their owning release path supplies fresh evidence.

## Recheck route

From an authenticated checkout, run:

```sh
GH_CONFIG_DIR=/path/to/authorized/gh-config gh release list --repo jonah-ux/mythophone --limit 10
GH_CONFIG_DIR=/path/to/authorized/gh-config gh api repos/jonah-ux/mythophone/tags
GH_CONFIG_DIR=/path/to/authorized/gh-config gh api repos/jonah-ux/mythophone/deployments
```

Keep the resulting source revision, deployment target, live URL, and visible behavior separate in the next release receipt.
