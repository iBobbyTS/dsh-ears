# Development

[AGENTS](../AGENTS.md) owns project boundaries; the parent repository's plugin-development standard owns the shared development/delivery contract. Run these commands from the fork checkout. End-user Git/tarball installation uses committed prebuilt artifacts and needs no plugin compiler.

## Tooling and editing

Use pnpm 11.19.0 and the exact development-tool versions in package.json/lockfile. The selected tsdown tool requires Node 22.19+, 24.11+ or 26+; this build-tool requirement is separate from the plugin runtime range. Development dependencies target DSH 0.2.2-rc.1 with Cordis 4.1.0/Schemastery 3.19.0.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build:runtime
pnpm check
```

Edit src, never generated lib. Commit the matching complete lib JS/maps with source changes. Host and Client have separate strict environment configs: NodeNext/Node without DOM, and Bundler/DOM/React. The plugin exports runtime entry points rather than a declaration SDK. JS maps embed their source contents with stable relative names. The Python worker is delivered directly from python/qwen3_worker.py.

## Commands and distribution

| Command | Responsibility |
| --- | --- |
| pnpm typecheck | Separate Host and Client environment checks |
| pnpm build:runtime | Clean only lib and regenerate all runtime JS/maps |
| pnpm test | Project Vitest regressions, including distribution failure probes |
| pnpm check:dist | Independent dirty-candidate rebuild, complete file/content comparison, actual pack, links/resources/maps, isolated tarball/Git installation and real Host/Client loading |
| pnpm check | typecheck + test + check:dist; no redundant maintained-lib build |
| pnpm verify:package | Current package/entry/Remote/native-module contract |
| pnpm compat:smoke | Target DSH 0.2.2-rc.1 fresh/canonical synthetic Qwen settings and browser loader smoke |

check:dist never overwrites the maintained lib before comparing it. A stale, missing or extra file fails with its path; rebuild explicitly, inspect and commit the matching output. It packs the actual candidate without suppressing installation scripts. It also builds a disposable Git fixture from that candidate and asks the target DSH CLI to acquire both tarball and Git forms into isolated profiles, independently of checkout/dev dependencies/reference sources. Its temporary fixture commit does not touch the project's Git history.

These checks need network/package-manager/Git access and a development Chromium installation for the served Client factory/apply probe. Set CHROMIUM_BIN if Chrome/Chromium is not auto-detected. A dedicated temporary browser profile and DSH_HOME are removed afterward; no microphone/model control is clicked. This is developer tooling, not an end-user dependency. Package acquisition, Host/Client loading, real Desktop interaction and real ASR inference are separate evidence claims.

The bounded diagnostic `node scripts/check-dist.mjs --rebuild-only` checks only independent output consistency; it does not satisfy the full distribution gate. No root build, prepare, prepack or installation compile hook exists.

## Local loading

After installing development dependencies and building, use the absolute checkout directory through the Desktop plugin manager or `dsh plugin --profile web add "$PWD"`. For Desktop CLI commands use the application's installed CLI path from [README](../README.en.md), its initialized desktop profile, and a fully quit application.

`pnpm dev:config`, `pnpm dev:web` and `pnpm dev:watch` retain local HMR support. The first two explicitly build and write only the ignored .dsh overlay. Host/Remote/schema changes need a Host restart; Client changes need a rebuild/refresh. Before delivery, run build:runtime so watch-era obsolete chunks are removed, then check.

## Release status

Package version remains 0.4.3; no release is implied. There is no automatic npm publishing workflow or inherited upstream publication authorization. Maintainer-authorized publication can use the existing offline release:check metadata command and the same verified tarball. Current installation and updates use this fork's Git source or a verified tarball.
