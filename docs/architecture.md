# Architecture

[AGENTS](../AGENTS.md) owns the product and maintenance boundaries. [Development](development.md) owns build and installation commands; [usage](usage.en.md) describes the product controls.

## Host and Client

The Host entry installs `QwenService` (`src/asr/service.ts`) under the `dshEarsQwen` service identity and `dshEars` Remote namespace. It owns settings access, the isolated Qwen3-ASR MLX Python worker, model downloads, idle unloading, and bounded realtime session registration. It has no LLM or credentials dependency.

The web Client contributes the Composer microphone, a conversation-scoped recognition bar, and the dedicated settings section. Desktop uses this same web contribution. The microphone captures mono 16 kHz PCM16, starts capture while local model startup is pending, and queues ordered chunks behind readiness. Stopping drains queued audio before finalization. Cancellation releases capture and any late-created Host session. The recording limit includes startup time.

`VoiceDraftWriter` uses the Host editor insertion and replacement contract to own a span. Each full Qwen hypothesis may shorten through Prefix Rollback. The user reviews the editable result and sends it manually; the plugin never sends. Tooltips render through the shared portal. Actual renderer/editor and microphone evidence remains separate from component and source-contract evidence.

## Settings

The Config schema uses loose volatile leaves so field saves apply live without recomposing the service. Persistence stays at schema version 4: `general.displayName`, `general.shortcut.enabled/value`, `general.soundsEnabled`, `recognition.localQwen.model/idleTtlMinutes/prompt`, and `recognition.maxRecordingSeconds`. The Client wire projects only their eight flat Qwen/general fields. Existing retained values remain readable; unrelated obsolete stored fields do not enter the wire or new patches. Reads do not rewrite a profile.

`SettingsDraftController` stages fields independently. The coordinator debounces valid edits for 400 ms, skips invalid fields, preserves newer edits during saves, and flushes when the section unmounts. A failed save keeps drafts. Model management provides install/download, cancellation, weight deletion, preload, and unload. Idle TTL unloads memory while retaining weights.

## Remote contract

`src/remote-definitions.ts` is the descriptor owner shared by Host Typert and Client Remote. Four settings/About calls, six Qwen management calls, and four realtime calls use strict zod codecs with factories. `startRealtime` reads retained model/TTL/prompt; `sendRealtimeAudio` accepts bounded base64 PCM16, `finishRealtime` returns a structured text success/error, and `cancelRealtime` closes the session. No backend selector, batch transcription, model route discovery, credentials, or polishing methods remain.

## Delivery and evidence

Package identity and upstream attribution remain unchanged. This fork is installed from its built checkout; the About panel's upstream npm information does not install or update this fork. Generated `lib/` is currently untracked and built before local loading or packing. The checked Host target is DSH 0.2.2-rc.1 source; peer ranges and the older compatibility smoke matrix alone do not establish every accepted Host version. Real Desktop/microphone acceptance is pending.
