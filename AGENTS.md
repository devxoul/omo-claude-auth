# omo-claude-auth

## Pre-commit checks

Before every commit, all three must pass:

```sh
bun run typecheck
bun run lint
bun run format
```

No exceptions. No `--no-verify`. No partial fixes.

## Release

Use the **Release** GitHub Actions workflow (`workflow_dispatch`, see `.github/workflows/release.yml`). It validates the version, typechecks, lints, checks formatting, bumps `package.json`, publishes to npm with provenance, then commits, tags, and creates a GitHub Release. Tags have no `v` prefix.

```sh
gh workflow run release.yml -f version=X.Y.Z
```

The workflow is the only supported release path. Never run `npm publish` locally.

**Version decision.** Specified version → use as-is. Otherwise **default to patch** and only escalate to minor when one of the explicit minor triggers below is clearly met. When in doubt, it's a patch.

**Judge the change, not the commit message.** The bump is decided by what the commits since the last release _actually do_ to the public surface — read the diffs, not the Conventional Commits prefix. A `feat(...)` subject is NOT evidence of a minor bump, and a `fix(...)` subject is NOT proof of a patch. For each non-trivial commit, ask: "Does this diff add or break one of the minor triggers below?" If none do, it's a patch. Inspect with `git log <last-tag>..HEAD` plus `git show <sha>` on anything that might touch the provider ID, model IDs, or environment variables.

- **patch** (the default) — bug fixes, refactors, docs, deps (including `opencode-claude-auth` bumps), internal-only changes, and any improvement that doesn't add a new public surface or break an existing one. Most releases are patches.
- **minor** — reserve for a genuinely new _public_ surface or a breaking change. Specifically, at least one of: (a) a new or renamed provider or model ID, (b) a new configuration surface (environment variable or setting) users can rely on, (c) a backwards-incompatible change to any of the above.
- Never bump major unless asked. Never ask the user which to bump.

`package.json` is the single source of truth for the version.

**Re-running after partial failure.** Every step is idempotent at the same version (`npm publish` is gated by `npm view`, `git tag -f`, `gh release` is gated by `gh release view`). Re-run the workflow at the same version and it cleans up whatever didn't finish.
