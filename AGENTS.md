# dsh-ears development rules

## Goal and exclusions

Provide microphone → local Qwen3-ASR MLX transcription → editable draft → manual send in DSH Web/Desktop on Apple Silicon macOS. The user owns the draft and final send; never auto-send. Other ASR backends, text polishing, and emotion recognition/UI are outside the product scope.

## Required boundaries

- Host owns the isolated Qwen Python/MLX runtime, model downloads, and recognition sessions. Browser code captures ordered PCM audio and manages the recording-owned draft span. No credential or LLM routes belong to the plugin.
- Scope voice work to the owning conversation. Preserve reference chips and manual edits; cancelled, stale, unmounted, or submitted voice work must not overwrite the user's draft. Keep stop/cancel available during active work.
- Keep Remote descriptors, codecs, result schemas, and cancellation behavior aligned. Optional wire fields are absent, never explicit `undefined`. Preserve bounded requests and disposal of capture, jobs, sockets, and model workers.
- Keep per-field settings auto-save and the retained Qwen/general persistence paths. Source, comments, developer documents, and commits use English; human READMEs and user guides have matching Chinese and English versions. Runtime localization remains a product concern.
- Verify consumed DSH APIs against the target source/packages. Accepted peer ranges are not validation evidence. Preserve valid unrelated work; stage explicit paths and do not commit secrets, user audio/transcripts, private logs, or machine-specific paths.
- Install/update examples must use this fork's prebuilt Git/tarball candidate; local development may load its built checkout. Upstream release history and npm identity confer no publishing rights. Pushing, publishing, tags, and visibility changes require explicit user authorization.

## Information owners and checks

[README](README.en.md) is the human entry. [Architecture](docs/architecture.md) owns current implementation detail; [development](docs/development.md) owns commands; [usage](docs/usage.en.md) owns user configuration; [open work](docs/roadmap.md) owns unresolved work. [ADRs](docs/decisions.md) preserve history: update the status index when superseding a decision, not its historical body. [SECURITY](SECURITY.md) owns data-handling and reporting policy.

Keep src and committed lib synchronized with build:runtime, and choose relevant package.json checks including check:dist. Rebuild changed artifacts, and distinguish automated/source-contract evidence from real renderer/microphone results. Check both README languages, links, commands, and actual installation targets after documentation changes. Before commits, review staged content and run `git diff --cached --check`.
