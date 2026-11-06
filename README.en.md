# dsh-ears

[中文](README.md) · English

Voice input, live transcription, and optional LLM polishing for DSH Web UI and Desktop. Results stay in an editable draft for manual sending. Backends include browser Web Speech, local Whisper, local Qwen3-ASR MLX on Apple Silicon, and cloud ASR providers.

This is a fork of [WizisCool/dsh-ears](https://github.com/WizisCool/dsh-ears). Build the checkout below to install this fork; the upstream npm package and the in-app upstream npm version information do not contain this fork's changes.

## Install

Requires DSH, Node.js `^22.19.0 || >=24.0.0`, and the pnpm version in `package.json`. On macOS:

```sh
git clone https://github.com/iBobbyTS/dsh-ears.git
cd dsh-ears
pnpm install --frozen-lockfile
pnpm build
```

On a fresh Windows/WSL install or when switching between them, run `pnpm use:platform` before installing dependencies. **Do not run it on macOS.** See [development](docs/development.md) for build and validation details.

Desktop: select the built repository directory in the application's plugin manager. Web: run from that directory:

```sh
dsh plugin --profile web add "$PWD"
```

Use the full path in Windows cmd. Restart the DSH Host and refresh the page. To update, update this checkout, rebuild, and reinstall through the same entry. The application owns the Desktop `desktop` profile.

## Use

Choose a backend on the dsh-ears settings page. Start/stop with the Composer microphone or `Ctrl+Shift+Space`; review the draft and send manually. Manual edits are preserved.

- Local Qwen requires Apple Silicon macOS and discoverable Python 3.10+. Install its environment/model in Recognition settings, then record directly without a separate server. First-time downloads need PyPI/Hugging Face access.
- Whisper downloads GGML models in settings and uses the bundled native runtime without Python/FFmpeg.
- Web Speech may be processed by the browser vendor. Cloud backends require credentials. Optional polishing uses a configured DSH model and incurs usage.

DSH 0.2.2-rc.1 has source-contract and automated verification. These results do not establish a real Desktop, microphone, or M4 Max end-to-end result.

## Documentation

[Usage and settings](docs/usage.en.md) · [Project documents](docs/README.md) · [Contributing](https://github.com/iBobbyTS/dsh-ears/blob/master/CONTRIBUTING.md) · [Development rules](https://github.com/iBobbyTS/dsh-ears/blob/master/AGENTS.md)

[History](CHANGELOG.md) · [Security](https://github.com/iBobbyTS/dsh-ears/blob/master/SECURITY.md) · [MIT](LICENSE)
