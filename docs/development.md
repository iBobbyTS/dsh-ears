# Development

[AGENTS](https://github.com/iBobbyTS/dsh-ears/blob/master/AGENTS.md) owns development constraints. Run commands from the fork checkout root. Node.js and pnpm versions come from `package.json`.

## Dependencies and build

On macOS, use `pnpm install --frozen-lockfile` directly. `pnpm use:platform` only manages Windows and Linux/WSL dependency trees; do not run it on macOS. On a fresh Windows/WSL clone or after switching between those platforms, stop dev servers, run `pnpm use:platform`, then install dependencies.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
pnpm verify:package
```

Local Qwen3-ASR requires Apple Silicon macOS and Python 3.10+ for its isolated MLX environment. This is separate from Local Whisper, whose bundled native runtime does not require Python or FFmpeg.

## Local loading and refresh

For Web, install the built checkout once with `dsh plugin --profile web add "$PWD"`. In Desktop, select the built directory in the application's plugin manager. Windows cmd uses the full directory path instead of `$PWD`.

```sh
pnpm dev:config
pnpm dev:web
pnpm dev:watch
```

`dev:config` and `dev:web` build and write the ignored `.dsh/cordis.patch.yml` HMR overlay. Do not insert a second loader entry. Run watch in a separate terminal when using it. Client changes need a rebuild and browser refresh; Host, settings registration, Remote, or schema changes also need a Host restart. A copied profile dependency must be refreshed before changes in this checkout reach the running app.

## Validation

Use the smallest checks that distinguish the changed behavior: `pnpm check`, relevant Vitest suites, and `pnpm build` when emitted artifacts change. `pnpm verify:package` checks the built package. `pnpm compat:smoke` uses the versions configured in its script; it does not certify every version accepted by peer ranges. A real renderer/microphone check remains separate from simulated contracts.

Before a commit, review explicit staged paths and run `git diff --cached --check`. Examples and docs must preserve the distinction between this fork's checkout and upstream published releases.

## Release status

Upstream release history and former trusted-publisher settings are recorded in [ADRs](decisions.md) and [CHANGELOG](../CHANGELOG.md). They do not grant this fork access to the upstream npm package or authorize a release. Define the target repository, package authority, version, and workflow with the maintainer before an authorized release.
