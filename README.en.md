# dsh-ears

[中文](README.md) · English

Local Qwen3-ASR MLX voice input for DSH Web UI and Desktop on Apple Silicon macOS. Transcription stays in an editable draft for manual sending.

This is a fork of [WizisCool/dsh-ears](https://github.com/WizisCool/dsh-ears). Install and update from this fork's Git repository or a verified tarball. Upstream npm releases do not contain this fork's changes.

## Compatibility

Verified: DSH 0.2.2-rc.1 (source review and automated checks); Desktop testing has not been completed. Qwen inference and microphone acceptance remain separate from package/loader checks.

Requires Apple Silicon macOS, discoverable Python 3.10+, and DSH's supported Node runtime (`^22.19.0 || >=24.0.0`). DSH manages installation dependencies; the plugin ships prebuilt JavaScript and does not compile during installation. Model setup is separate and initially needs PyPI/Hugging Face access.

## Install

Desktop: open DeepSeek Harness once to initialize its application-owned profile, then fully quit it. Use the application's installed CLI:

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add "git+https://github.com/iBobbyTS/dsh-ears.git"
```

Web:

```sh
dsh plugin --profile web add "git+https://github.com/iBobbyTS/dsh-ears.git"
```

For a fixed candidate, append `#<commit>` to the Git URL, or replace the URL with the absolute path of its verified `dsh-ears-0.4.3.tgz`. Use a fork commit containing the checked `lib/` artifacts. Restart the Host and refresh the Client after installation.

To update, repeat the same add command with this fork's URL or the desired new commit/tarball. Restart the Host and refresh the Client. The About panel links to this fork's instructions; it does not query upstream npm or install updates automatically.

## Use

In dsh-ears settings → Recognition, install the runtime/model and choose the model, context prompt and idle TTL. Start/stop with the Composer microphone or `Ctrl+Shift+Space`, review the draft and send manually. No separate API server is required; inference stays local.

## Documentation

[Usage and settings](docs/usage.en.md) · [Development and verification](docs/development.md) · [Project documents](docs/README.md) · [Contributing](CONTRIBUTING.md) · [Development rules](AGENTS.md)

[History](CHANGELOG.md) · [Security](SECURITY.md) · [MIT](LICENSE)
