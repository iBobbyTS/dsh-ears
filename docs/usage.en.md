# Usage

[中文](usage.zh.md) · [Installation](../README.en.md)

Use local Qwen3-ASR MLX on Apple Silicon macOS with discoverable Python 3.10+. In settings → dsh-ears → Recognition, choose `1.7b-8bit` (default) or `0.6b-8bit`, then Install / download. Initial setup needs PyPI and Hugging Face access. The Host manages an isolated environment and allowlisted model weights; inference runs locally with no separate server or listening port.

Click the Composer microphone or press `Ctrl+Shift+Space` to start/stop. The recognition bar shows progress and a waveform. Stop finishes recognition; discard cancels in-flight transcription. Escape ends voice work and leaves the accepted draft for review. Edit the draft and send manually. Reference chips and manual edits belong to the user.

## Settings

| Tab | Options |
| --- | --- |
| General | Display name, shortcut toggle/chord, sound cues, recording limit (1–600 seconds; default 120) |
| Recognition | Qwen model, idle TTL (1–1440 minutes; default 60), context prompt (up to 1024 characters), model/runtime management |
| About | Version, license, DSH compatibility, fork installation/update instructions |

Valid fields save independently after a short delay or on blur. Invalid drafts stay visible without blocking another valid field. A failed save keeps edits. An empty context prompt removes model biasing; a prompt can steer script or domain terms.

Model controls support download cancellation, weight deletion, preload, and manual unload. Active sessions block unload/deletion. Idle TTL releases model memory after the final session closes and retains downloaded weights; the next recording reloads them automatically.

## Limits and evidence

Other platforms cannot run the MLX worker. No alternate recognition backend or text polishing is provided. Model quality and latency depend on hardware and recording conditions. Actual Desktop/microphone and M4 Max integration acceptance remains pending; automated/component checks do not establish that result.
