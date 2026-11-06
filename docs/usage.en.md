# Usage guide

[Installation](../README.en.md) · [中文](usage.zh.md)

## Usage

1. Click the microphone icon or press `Ctrl+Shift+Space` (configurable in settings).
2. Start speaking.
3. Press the shortcut again or click the microphone to stop recording and start transcription.
4. With polishing enabled, the raw transcript appears in the draft first. Once polishing completes, it replaces the text while preserving any manual edits made in the meantime.
5. Review the text and send manually.

Transcription results are always written to an editable draft and are never sent automatically. If the selected backend is not ready, the microphone icon is disabled — hover over it to see why.

## Recognition backends

| Backend | How it works | Requirements |
| --- | --- | --- |
| Web Speech | In-browser real-time recognition | Default backend; Chromium-based browser |
| Local Qwen3-ASR (MLX) | Local streaming on Apple Silicon | Install runtime/model in settings; see below |
| Local Whisper | Local transcription after recording stops | Download GGML models in settings |
| [Groq](https://console.groq.com) | [Groq Whisper API](https://console.groq.com/docs/speech-text) | API key |
| [Deepgram](https://deepgram.com) | [Pre-recorded audio](https://developers.deepgram.com/docs/pre-recorded-audio) or [live audio streaming](https://developers.deepgram.com/docs/live-streaming-audio) | API key, model name (e.g. `nova-3`) |
| [Alibaba Cloud Model Studio](https://www.alibabacloud.com/help/en/model-studio/what-is-model-studio) | [DashScope synchronous transcription](https://www.alibabacloud.com/help/en/model-studio/fun-asr-flash-recorded-speech-recognition-http-api) | API key, synchronous model ID; max 300 s per recording |
| [Tencent Cloud](https://cloud.tencent.com/product/asr) | [Recording file recognition](https://cloud.tencent.com/document/api/1093/37823) or [real-time WebSocket](https://cloud.tencent.com/document/api/1093/48982) | AppID, SecretID, SecretKey, `engine_type` |
| [Xiaomi MiMo](https://mimo.mi.com) | [Speech Recognition API](https://mimo.mi.com/docs/en-US/api/audio/Speech-Recognition), supporting standard API or [Token Plan](https://mimo.mi.com/docs/en-US/tokenplan/Token%20Plan/subscription) | API key, model name (e.g. `mimo-v2.5-asr`); Token Plan requires a regional cluster |
| [SiliconFlow (CN)](https://siliconflow.cn) | [Audio Transcription API](https://api-docs.siliconflow.cn/docs/api/audio-transcriptions-post) | API key, model name (e.g. `FunAudioLLM/SenseVoiceSmall`) |
| [Volcengine](https://www.volcengine.com/product/doubao) | [Doubao audio file recognition](https://docs.volcengine.com/docs/6561/1354868) or [Doubao one-way streaming ASR](https://docs.volcengine.com/docs/6561/2628951) | API key (new-console `X-Api-Key`), resource ID |
| Custom OpenAI-compatible | Sends to a specified `/audio/transcriptions` endpoint | Endpoint URL, API key, model name |

> **Local Whisper**: Runs whisper.cpp locally via `@fugood/whisper.node` without Python, FFmpeg, or external dependencies. Supports downloading and managing GGML models (`tiny` (default) through `turbo`) in settings, with `default` (auto), `vulkan`, or `cuda` acceleration.
>
> **Alibaba Cloud Model Studio**: the upgraded console issues a workspace-specific API host (Beijing: `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com`; Singapore: `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com`). Enter that host and a **synchronous model ID** (`qwen3-asr-flash`, `qwen-audio-3.1-asr-flash`, or `fun-asr-flash-2026-06-15`), not the console display name and not a `-filetrans`, `-streaming`, `-message`, or `-realtime` variant — those use asynchronous or WebSocket APIs that dsh-ears does not support.
>
> **Volcengine**: Accepts only the new-console API Key (`X-Api-Key`) authentication (legacy AppID + Access Token is not supported). Obtain keys from the [console API Key page](https://console.volcengine.com/speech/new/setting/apikeys).

## Polishing

Enabled by default. Leave both provider and model empty to use dsh's default Agent model (including its default reasoning settings); you can also select any model configured in dsh. LLM credentials reuse dsh's existing configuration. Reasoning effort is configurable.

The default prompt removes filler words, fixes common ASR errors, handles self-corrections, and formats lists. Customize the prompt or view the default content in settings. If polishing fails or is cancelled, the raw transcript is preserved.

## Settings

After installation, a dsh-ears section appears in the Web UI settings page, organized into four tabs:

| Tab | Configurable options |
| --- | --- |
| General | Settings display name, voice shortcut toggle and key combination, audio cues toggle, max recording duration (1–600 s, default 120 s) |
| Recognition | Backend selection, language, local Whisper model and acceleration, cloud providers and credentials |
| Polishing | Toggle, LLM provider and model, reasoning effort, custom prompt (up to 4,000 characters) |
| About | Version, license, dsh compatibility range, upstream npm version information only (no install or update command) |

## Known limitations

- The Web Speech backend relies on the browser implementation; audio may be sent to browser vendor servers for processing and is not a strictly local/offline solution.
- Alibaba Cloud Model Studio (Bailian) recordings are capped at 300 seconds per audio; Qwen-Audio 3.1 may return no words for very short or silent audio, so prefer `qwen3-asr-flash` for short voice input.
- Deepgram Flux models require the Listen V2 protocol and are currently unsupported.
- Local Whisper has a single-recording limit of 24 MB and a 120-second transcription timeout.
- Acceleration backend (`default` / `vulkan` / `cuda`) is locked after the first native module load; switching requires restarting `dsh web`.


## Local MLX Qwen3-ASR streaming

This fork provides native Qwen3-ASR MLX streaming on Apple Silicon macOS, with live transcript revision inside the DSH Composer. Each voice-owned span uses revision-guarded insertion; pre-existing reference chips are retained. If the user edits or submits the draft while dictating, late ASR output cannot overwrite those edits.

In Plugin settings → Recognition, select Local Qwen3-ASR (MLX). Choose 1.7b-8bit (default) or 0.6b-8bit and click Install / download. The DSH Host creates an isolated Python virtual environment, installs pinned mlx-qwen3-asr, and downloads allowlisted weights. Use the Composer microphone directly after setup: **no manual serve, separate API server, or listening port is required**.

The plugin panel includes download cancellation, weight deletion, service preload, and manual unload. The **default idle TTL is 60 minutes** (configurable 1–1440): after the final session closes, the Host stops the MLX worker to free model memory. **Downloaded weights remain on disk** and are automatically reloaded on the next recording. Active dictation is never stopped by the idle TTL.

Prerequisites: Apple Silicon macOS, discoverable Python 3.10+, internet access to PyPI and Hugging Face for first-time setup. Downloads begin only from the plugin control; speech inference stays on-device. Existing Whisper, Web Speech, and cloud backends remain available on other platforms.

The current fork has not yet completed a real M4 Max integration acceptance test. It uses Qwen3-ASR windowed streaming re-decode with Prefix Rollback and one-second chunks. Manual draft edits invalidate ownership of the interim speech span to preserve the user's text.
