"""dsh-ears managed Qwen3-ASR MLX worker (NDJSON over stdio).

The Host owns the process. No listening sockets, external server, or user-managed
daemon are required. Only allowlisted checkpoints may be downloaded.
"""
from __future__ import annotations

import base64
import json
import os
import sys

MODEL_REPOS = {
    "1.7b-8bit": "moona3k/mlx-qwen3-asr-1.7b-8bit",
    "0.6b-8bit": "moona3k/mlx-qwen3-asr-0.6b-8bit",
}


def send(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def download(model_id: str, directory: str) -> None:
    if model_id not in MODEL_REPOS:
        raise ValueError("Unsupported Qwen3 model")
    from huggingface_hub import snapshot_download
    snapshot_download(
        repo_id=MODEL_REPOS[model_id],
        local_dir=directory,
        local_dir_use_symlinks=False,
    )
    # Written last: incomplete downloads cannot masquerade as a ready model.
    marker = os.path.join(directory, ".dsh-ears-ready")
    temporary = marker + ".tmp"
    with open(temporary, "w", encoding="utf-8") as handle:
        handle.write(MODEL_REPOS[model_id] + "\n")
    os.replace(temporary, marker)


def serve(model_dir: str) -> None:
    import numpy as np
    from mlx_qwen3_asr import Session

    # The MLX model is constructed once and reused for every streaming session.
    asr = Session(model_dir)
    sessions = {}
    send({"type": "ready"})

    for line in sys.stdin:
        try:
            request = json.loads(line)
            req_id = request.get("id")
            kind = request.get("type")
            session_id = request.get("sessionId")
            if kind == "start":
                if not isinstance(session_id, str) or len(session_id) > 128:
                    raise ValueError("Invalid session identifier")
                if session_id in sessions:
                    raise ValueError("Session already exists")
                sessions[session_id] = asr.init_streaming(
                    chunk_size_sec=float(request.get("chunkSizeSec", 1.0)),
                    max_context_sec=30.0,
                    unfixed_chunk_num=2,
                    unfixed_token_num=5,
                    endpointing_mode="energy",
                    context=str(request.get("context", ""))[:1024],
                )
                send({"id": req_id, "text": "", "final": False})
            elif kind == "feed":
                if session_id not in sessions:
                    raise ValueError("Unknown or closed session")
                data = base64.b64decode(request["pcm"], validate=True)
                if len(data) > 32000 or len(data) % 2:
                    raise ValueError("Invalid 16 kHz PCM16 audio")
                pcm = np.frombuffer(data, dtype="<i2").copy()
                state = asr.feed_audio(pcm, sessions[session_id])
                send({"id": req_id, "text": state.text, "final": False})
            elif kind == "finish":
                if session_id not in sessions:
                    raise ValueError("Unknown or closed session")
                state = asr.finish_streaming(sessions.pop(session_id))
                send({"id": req_id, "text": state.text, "final": True})
            elif kind == "cancel":
                sessions.pop(session_id, None)
                send({"id": req_id, "text": "", "final": True})
            elif kind == "ping":
                send({"id": req_id, "text": "", "final": False})
            else:
                raise ValueError("Unknown command")
        except Exception as exc:
            # Never echo audio or payloads into errors/logs.
            send({"id": req_id if "req_id" in locals() else None,
                  "error": f"{type(exc).__name__}: {str(exc)[:200]}"})


if __name__ == "__main__":
    try:
        if len(sys.argv) == 4 and sys.argv[1] == "--download":
            download(sys.argv[2], sys.argv[3])
        elif len(sys.argv) == 2:
            serve(sys.argv[1])
        else:
            raise ValueError("Expected a model path or --download MODEL DESTINATION")
    except Exception as error:
        print(f"Qwen3-ASR: {type(error).__name__}: {str(error)[:250]}", file=sys.stderr)
        raise SystemExit(1)
