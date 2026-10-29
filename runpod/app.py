"""RunPod test host for OpenTakeoff.

Serves the compiled SPA and exposes a deliberately small persistent-file API.
The API is disabled unless OPENTAKEOFF_STORAGE_TOKEN is configured. Files live
under OPENTAKEOFF_DATA_DIR, which defaults to RunPod's persistent /workspace
mount. This is deployment plumbing, not a replacement for the browser store yet.
"""

from __future__ import annotations

import hmac
import os
import re
import tempfile
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse

DATA_DIR = Path(os.environ.get("OPENTAKEOFF_DATA_DIR", "/workspace/opentakeoff-data")).resolve()
STATIC_DIR = Path(__file__).with_name("static").resolve()
TOKEN = os.environ.get("OPENTAKEOFF_STORAGE_TOKEN", "").strip()
PUBLIC_STORAGE = os.environ.get("OPENTAKEOFF_STORAGE_PUBLIC", "").strip().lower() in {"1", "true", "yes"}
MAX_UPLOAD_BYTES = int(os.environ.get("OPENTAKEOFF_MAX_UPLOAD_BYTES", str(2 * 1024**3)))
SAFE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ ()-]{0,199}$")
ALLOWED_SUFFIXES = {".pdf", ".otk", ".json", ".png", ".jpg", ".jpeg", ".webp"}

DATA_DIR.mkdir(parents=True, exist_ok=True)
app = FastAPI(title="OpenTakeoff RunPod test host", version="0.1.0")


def authorize(value: str | None) -> None:
    if PUBLIC_STORAGE:
        return
    if not TOKEN:
        raise HTTPException(status_code=503, detail="RunPod storage is not configured.")
    supplied = value.removeprefix("Bearer ").strip() if value else ""
    if not hmac.compare_digest(supplied, TOKEN):
        raise HTTPException(status_code=401, detail="Invalid storage token.")


def file_path(name: str) -> Path:
    if not SAFE_NAME.fullmatch(name) or Path(name).suffix.lower() not in ALLOWED_SUFFIXES:
        raise HTTPException(status_code=400, detail="Unsupported file name or type.")
    target = (DATA_DIR / name).resolve()
    if target.parent != DATA_DIR:
        raise HTTPException(status_code=400, detail="Invalid file path.")
    return target


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "service": "opentakeoff-runpod",
        "storage_configured": bool(TOKEN) or PUBLIC_STORAGE,
        "storage_mode": "public-test" if PUBLIC_STORAGE else "token" if TOKEN else "disabled",
    }


@app.get("/runpod/api/files")
def list_files(authorization: str | None = Header(default=None)) -> dict:
    authorize(authorization)
    files = [
        {"name": item.name, "size": item.stat().st_size, "modified": item.stat().st_mtime}
        for item in DATA_DIR.iterdir()
        if item.is_file() and item.suffix.lower() in ALLOWED_SUFFIXES
    ]
    return {"files": sorted(files, key=lambda item: item["name"].lower())}


@app.put("/runpod/api/files/{name}")
async def put_file(name: str, request: Request, authorization: str | None = Header(default=None)) -> dict:
    authorize(authorization)
    target = file_path(name)
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the configured upload limit.")

    written = 0
    fd, temporary_name = tempfile.mkstemp(prefix=".upload-", dir=DATA_DIR)
    try:
        with os.fdopen(fd, "wb") as temporary:
            async for chunk in request.stream():
                written += len(chunk)
                if written > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="File exceeds the configured upload limit.")
                temporary.write(chunk)
            temporary.flush()
            os.fsync(temporary.fileno())
        os.replace(temporary_name, target)
    except Exception:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise
    return {"name": target.name, "size": written}


@app.get("/runpod/api/files/{name}")
def get_file(name: str, authorization: str | None = Header(default=None)) -> FileResponse:
    authorize(authorization)
    target = file_path(name)
    if not target.is_file():
        raise HTTPException(status_code=404, detail="File not found.")
    return FileResponse(target, filename=target.name)


@app.delete("/runpod/api/files/{name}")
def delete_file(name: str, authorization: str | None = Header(default=None)) -> dict:
    authorize(authorization)
    target = file_path(name)
    if target.is_file():
        target.unlink()
    return {"deleted": target.name}


@app.get("/{path:path}")
def web(path: str):
    candidate = (STATIC_DIR / path).resolve()
    if candidate == STATIC_DIR or STATIC_DIR in candidate.parents:
        if candidate.is_file():
            return FileResponse(candidate)
    index = STATIC_DIR / "index.html"
    return FileResponse(index) if index.is_file() else JSONResponse({"detail": "Web build unavailable."}, status_code=404)
