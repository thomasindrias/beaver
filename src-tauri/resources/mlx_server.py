"""Osprey MLX vision server.

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

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

MODEL_REPO = "mlx-community/Qwen2.5-VL-3B-Instruct-4bit"

STATE = {"status": "loading", "progress": None}
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

        STATE["status"] = "downloading"
        local_path = snapshot_download(MODEL_REPO)

        STATE["status"] = "loading"
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
    args = parser.parse_args()

    threading.Thread(target=_worker, daemon=True).start()
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")
