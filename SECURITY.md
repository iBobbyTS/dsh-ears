# Security Policy

## Scope and data handling

dsh-ears handles microphone audio and transcripts for local Qwen3-ASR MLX. The Client sends bounded ordered mono 16 kHz PCM16 chunks to the DSH Host, which owns the isolated Python/MLX environment and model cache. Inference uses private worker stdio with no listening server. Audio and transcripts are not intentionally logged or persisted by the plugin. The draft remains editable and requires manual send.

Explicit setup downloads pinned dependencies and allowlisted weights. Inference does not use a cloud ASR provider or LLM. No API key or credential configuration is part of this plugin. Never put secrets, user audio, transcripts, or private logs into source, fixtures, or reports.

## Host safety

- Cancel closes the affected recognition session; idle expiry, unload, and Host disposal release the worker.
- Audio, response, stderr, and transcript sizes are bounded.
- Abort signals propagate to cancellable recognition work; capture owns release of microphone tracks.
- Model downloads begin from explicit model controls and use the plugin cache.

## Never commit

- API keys, OAuth tokens, cookies, passwords, private keys, or credentials.
- dsh profiles or `.env` files containing credentials.
- User audio, transcripts, logs, screenshots, or personal data.
- Private endpoints, internal addresses, or personal absolute paths.

## Reporting

Do not open a public issue containing a secret or a complete exploit. Stop the relevant work and report it privately to the maintainer with only the minimum information needed to reproduce it.

## Release rule

Push, public-repository conversion, npm publishing, and release tags are not default actions. Before any public release, complete a human review, sensitive-information scan, build/test verification, dependency audit, and license review.

CI runs a non-blocking production dependency audit for early warning; it does not replace the human dependency audit required before release.
