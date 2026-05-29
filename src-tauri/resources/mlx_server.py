"""Osprey MLX vision server.

Loads Qwen2.5-VL-3B-Instruct-4bit once and exposes:
  GET  /health  -> {"status": "downloading"|"loading"|"ready"|"error", "progress": float|None}
  POST /extract -> {"markdown": str}

Heavy imports (mlx, huggingface_hub) are deferred into functions so the module
imports cheaply for tests and so /health is serveable before the model loads.
"""
import argparse
import base64
import os
import tempfile
import threading

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

MODEL_REPO = "mlx-community/Qwen2.5-VL-3B-Instruct-4bit"

STATE = {"status": "loading", "progress": None}
_model = None
_processor = None
_config = None
# Serialize inference: MLX model state isn't safe for concurrent generate()
# calls, and the global shortcut can fire two captures in quick succession.
_infer_lock = threading.Lock()

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

    from mlx_vlm import generate
    from mlx_vlm.prompt_utils import apply_chat_template

    img_bytes = base64.b64decode(req.image_base64)
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        f.write(img_bytes)
        path = f.name
    try:
        with _infer_lock:
            formatted = apply_chat_template(_processor, _config, req.prompt, num_images=1)
            result = generate(
                _model, _processor, formatted, image=[path], max_tokens=1024, verbose=False
            )
        text = result if isinstance(result, str) else (getattr(result, "text", None) or str(result))
        return {"markdown": text.strip()}
    except Exception as e:  # surface model errors as a clean 500
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        os.unlink(path)


def load_model():
    global _model, _processor, _config
    try:
        from huggingface_hub import snapshot_download

        STATE["status"] = "downloading"
        local_path = snapshot_download(MODEL_REPO)

        STATE["status"] = "loading"
        from mlx_vlm import load

        _model, _processor = load(local_path)
        _config = getattr(_model, "config", None)
        STATE["status"] = "ready"
    except Exception as e:  # leave a diagnosable state
        STATE["status"] = "error"
        STATE["progress"] = None
        print(f"mlx_server: model load failed: {e}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, required=True)
    args = parser.parse_args()

    threading.Thread(target=load_model, daemon=True).start()
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")
