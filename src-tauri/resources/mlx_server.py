"""Beaver MLX vision server.

Loads Qwen2.5-VL-3B-Instruct-4bit once and exposes:
  GET  /health  -> {"status": "downloading"|"loading"|"ready"|"error", "progress": float|None}
  POST /extract -> {"markdown": str}

Heavy imports (mlx, huggingface_hub) are deferred into the worker thread so the
module imports cheaply for tests and so /health is serveable before the model
loads. All MLX work happens on that one worker thread on purpose: MLX's Metal
stream is thread-local, so loading the model on one thread and running
generate() on another (FastAPI runs sync endpoints in a threadpool) fails with
"There is no Stream(gpu, N) in current thread".
"""
import argparse
import base64
import os
import queue
import tempfile
import threading
import time

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from tqdm import tqdm as _tqdm

MODEL_REPO = "mlx-community/Qwen2.5-VL-3B-Instruct-4bit"

STATE = {"status": "loading", "progress": None}


class _ProgressTqdm(_tqdm):
    """Aggregates download progress for the onboarding UI.

    snapshot_download opens one tqdm bar per file (unit="B") plus an outer
    "Fetching N files" bar (unit != "B"); we sum bytes across the byte bars and
    publish the fraction into STATE["progress"]. We track counts in our own
    registry rather than tqdm's self.n because the server runs headless, where
    tqdm disables itself and stops advancing self.n.
    """

    _lock = threading.Lock()
    _bars: dict = {}  # id(bar) -> [done_bytes, total_bytes, unit]

    def __init__(self, *args, **kwargs):
        kwargs.setdefault("disable", True)  # headless: suppress terminal render
        # tqdm's disabled path skips setting self.unit, so capture it here.
        self._unit = kwargs.get("unit", "it")
        self._total = kwargs.get("total") or 0
        super().__init__(*args, **kwargs)
        with _ProgressTqdm._lock:
            _ProgressTqdm._bars[id(self)] = [0, self._total, self._unit]
        _recompute_progress()

    def update(self, n=1):
        with _ProgressTqdm._lock:
            rec = _ProgressTqdm._bars.get(id(self))
            if rec is not None:
                rec[0] += n
        _recompute_progress()
        return super().update(n)

    @classmethod
    def reset(cls):
        with cls._lock:
            cls._bars.clear()


def _recompute_progress():
    with _ProgressTqdm._lock:
        byte_bars = [r for r in _ProgressTqdm._bars.values() if r[2] == "B"]
        total = sum(r[1] for r in byte_bars)
        done = sum(r[0] for r in byte_bars)
    STATE["progress"] = min(done / total, 1.0) if total > 0 else None


def _resolve_model(snapshot_download):
    """Return the model's local path, downloading only if it isn't fully cached.

    A complete cache (e.g. a dev re-run of onboarding via BEAVER_FORCE_ONBOARDING)
    skips the "downloading" phase entirely and goes straight to loading, instead
    of flashing a download UI for a model that's already on disk.
    """
    try:
        return snapshot_download(MODEL_REPO, local_files_only=True)
    except Exception:
        STATE["status"] = "downloading"
        STATE["progress"] = 0.0
        _ProgressTqdm.reset()
        return snapshot_download(MODEL_REPO, tqdm_class=_ProgressTqdm)


def _parent_alive(parent_pid: int) -> bool:
    """True while our parent is still the process that spawned us. When Beaver
    dies (crash, force-quit), macOS reparents us and getppid() changes."""
    return os.getppid() == parent_pid


def _watch_parent(parent_pid: int, poll_seconds: float = 2.0):
    while True:
        if not _parent_alive(parent_pid):
            os._exit(0)
        time.sleep(poll_seconds)


# Inference jobs: (prompt, image_path, result_holder, done_event). The single
# worker thread drains this, which also serializes the burst of captures the
# global shortcut can fire.
_jobs: "queue.Queue" = queue.Queue()

app = FastAPI()


class ExtractReq(BaseModel):
    image_base64: str
    prompt: str


@app.get("/health")
def health():
    return {"status": STATE["status"], "progress": STATE["progress"]}


@app.post("/extract")
def extract(req: ExtractReq):
    if STATE["status"] != "ready":
        raise HTTPException(status_code=503, detail="model not ready")

    img_bytes = base64.b64decode(req.image_base64)
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        f.write(img_bytes)
        path = f.name

    holder: dict = {}
    done = threading.Event()
    _jobs.put((req.prompt, path, holder, done))
    done.wait()
    try:
        if "error" in holder:
            raise HTTPException(status_code=500, detail=holder["error"])
        return {"markdown": holder["text"].strip()}
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


def _worker():
    """Own the model on one thread: load it, then run every generate() here."""
    try:
        from huggingface_hub import snapshot_download

        local_path = _resolve_model(snapshot_download)

        STATE["status"] = "loading"
        STATE["progress"] = None  # loading into memory has no measurable %
        from mlx_vlm import load

        model, processor = load(local_path)
        config = getattr(model, "config", None)
        STATE["status"] = "ready"
    except Exception as e:  # leave a diagnosable state
        STATE["status"] = "error"
        STATE["progress"] = None
        print(f"mlx_server: model load failed: {e}", flush=True)
        return

    from mlx_vlm import generate
    from mlx_vlm.prompt_utils import apply_chat_template

    while True:
        prompt, path, holder, done = _jobs.get()
        try:
            formatted = apply_chat_template(processor, config, prompt, num_images=1)
            result = generate(
                model, processor, formatted, image=[path], max_tokens=1024, verbose=False
            )
            holder["text"] = (
                result
                if isinstance(result, str)
                else (getattr(result, "text", None) or str(result))
            )
        except Exception as e:  # surface model errors as a clean 500
            holder["error"] = str(e)
        finally:
            done.set()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--parent-pid", type=int, default=None)
    args = parser.parse_args()

    if args.parent_pid is not None:
        threading.Thread(
            target=_watch_parent, args=(args.parent_pid,), daemon=True
        ).start()
    threading.Thread(target=_worker, daemon=True).start()
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")
