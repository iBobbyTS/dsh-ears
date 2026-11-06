# Open work

[AGENTS](https://github.com/iBobbyTS/dsh-ears/blob/master/AGENTS.md) owns the product goal and exclusions; [architecture](architecture.md) describes the current implementation. Historical upstream milestones and decisions remain in [ADRs](decisions.md) and [CHANGELOG](../CHANGELOG.md).

- D-018 remains open: final `transcribe()` reads backend/model/language at Host RPC start. Changing this to a recording-start snapshot or a capture lock requires an explicit protocol choice.
- Live cloud-provider, Windows, and local Qwen3-ASR/M4 Max end-to-end evidence remains distinct from automated or source-contract checks. The existing documentation does not claim those pending results passed.
- Emotion recognition/UI remains outside the current product scope. New ASR providers need their actual protocol and integration evidence.
