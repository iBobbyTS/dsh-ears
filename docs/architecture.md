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

`src/remote-definitions.ts` is the descriptor owner shared by Host Typert and Client Remote. Three settings/About calls, six Qwen management calls, and four realtime calls use strict zod codecs with factories. `startRealtime` reads retained model/TTL/prompt; `sendRealtimeAudio` accepts bounded base64 PCM16, `finishRealtime` returns a structured text success/error, and `cancelRealtime` closes the session. No backend selector, batch transcription, model route discovery, credentials, or polishing methods remain.

## Delivery and evidence

Package identity and upstream attribution remain unchanged. Runtime lib JS/maps are generated from src and committed with it; Python/locale/assets are direct maintained resources. The package has no implicit install/Git compilation lifecycle and no root build command. About links to this fork's installation/update instructions rather than querying upstream npm.

Host and Client type environments are separate. DSH 0.2.2-rc.1 platform.ts/seed.ts at source 66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db supplies the consumed React, zod, client-store and UI primitives/slots module identities. The Client external list comes from scripts/browser-modules.mjs; remaining imports are bundled. Host services/frameworks remain peers, while Host zod parsing has an ordinary runtime dependency: a browser seed alone does not make a Node package available in a Profile. Store-engine packages are only development fixtures for Node-side tests; browser runtime uses the Host's store.

check:dist independently rebuilds current dirty inputs before comparing all generated files, then verifies the actual tarball and isolated target DSH tarball/Git acquisition and Host/browser factory loading. These checks do not establish real Desktop microphone or Qwen inference acceptance. [Development](development.md) owns prerequisites and commands.
