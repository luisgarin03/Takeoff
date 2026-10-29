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
from typing import Literal

import fitz
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel, Field

DATA_DIR = Path(os.environ.get("OPENTAKEOFF_DATA_DIR", "/workspace/opentakeoff-data")).resolve()
STATIC_DIR = Path(__file__).with_name("static").resolve()
TOKEN = os.environ.get("OPENTAKEOFF_STORAGE_TOKEN", "").strip()
PUBLIC_STORAGE = os.environ.get("OPENTAKEOFF_STORAGE_PUBLIC", "").strip().lower() in {"1", "true", "yes"}
MAX_UPLOAD_BYTES = int(os.environ.get("OPENTAKEOFF_MAX_UPLOAD_BYTES", str(2 * 1024**3)))
SAFE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ ()-]{0,199}$")
ALLOWED_SUFFIXES = {".pdf", ".otk", ".json", ".png", ".jpg", ".jpeg", ".webp"}

DATA_DIR.mkdir(parents=True, exist_ok=True)
app = FastAPI(title="OpenTakeoff RunPod test host", version="0.1.0")


class SearchTarget(BaseModel):
    file: str
    display_name: str
    page: int | None = Field(default=None, ge=1)


class SearchRequest(BaseModel):
    terms: list[str] = Field(min_length=1, max_length=40)
    targets: list[SearchTarget] = Field(min_length=1, max_length=100)
    mode: Literal["text"] = "text"


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


def pdf_path(name: str) -> Path:
    target = file_path(name)
    if target.suffix.lower() != ".pdf" or not target.is_file():
        raise HTTPException(status_code=404, detail="PDF not found.")
    return target


@app.get("/runpod/api/pdf/{name}/metadata")
def pdf_metadata(name: str, authorization: str | None = Header(default=None)) -> dict:
    authorize(authorization)
    target = pdf_path(name)
    with fitz.open(target) as document:
        return {"name": target.name, "pages": document.page_count}


@app.get("/runpod/api/pdf/{name}/pages/{page}/render")
def render_pdf_page(
    name: str,
    page: int,
    scale: float = 1.0,
    authorization: str | None = Header(default=None),
) -> Response:
    authorize(authorization)
    target = pdf_path(name)
    safe_scale = max(0.25, min(float(scale), 4.0))
    with fitz.open(target) as document:
        if page < 1 or page > document.page_count:
            raise HTTPException(status_code=404, detail="PDF page not found.")
        pixmap = document.load_page(page - 1).get_pixmap(matrix=fitz.Matrix(safe_scale, safe_scale), alpha=False)
        png = pixmap.tobytes("png")
    return Response(
        content=png,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=31536000, immutable", "X-OpenTakeoff-Compute": "runpod"},
    )


def term_occurrences(text: str, term: str):
    lower_text, lower_term = text.casefold(), term.casefold()
    start = 0
    while lower_term and (index := lower_text.find(lower_term, start)) >= 0:
        before = lower_text[index - 1] if index else ""
        after_index = index + len(lower_term)
        after = lower_text[after_index] if after_index < len(lower_text) else ""
        if (not before or not before.isalnum()) and (not after or not after.isalnum()):
            yield index
        start = index + max(1, len(lower_term))


@app.post("/runpod/api/search")
def search_pdf_text(payload: SearchRequest, authorization: str | None = Header(default=None)) -> dict:
    authorize(authorization)
    terms = [term.strip()[:200] for term in payload.terms if term.strip()]
    matches: list[dict] = []
    documents: list[dict] = []
    for target_index, requested in enumerate(payload.targets):
        target = pdf_path(requested.file)
        searched = {
            "documentKey": f"runpod-{target_index}-{target.stat().st_mtime_ns}",
            "fileName": requested.display_name,
            "documentId": None,
            "totalPagesSearched": 0,
            "searchStatus": "searched",
        }
        documents.append(searched)
        with fitz.open(target) as document:
            pages = [requested.page] if requested.page else range(1, document.page_count + 1)
            for page_number in pages:
                if page_number is None or page_number < 1 or page_number > document.page_count:
                    continue
                page = document.load_page(page_number - 1)
                searched["totalPagesSearched"] += 1
                width, height = max(1.0, page.rect.width), max(1.0, page.rect.height)
                for block in page.get_text("dict", flags=fitz.TEXTFLAGS_TEXT).get("blocks", []):
                    for line in block.get("lines", []):
                        for span in line.get("spans", []):
                            text = span.get("text", "")
                            if not text:
                                continue
                            x0, y0, x1, y1 = span.get("bbox", (0, 0, 0, 0))
                            char_width = max(1.0, x1 - x0) / max(1, len(text))
                            for term in terms:
                                for start in term_occurrences(text, term):
                                    match_width = max(char_width, char_width * len(term))
                                    context_start, context_end = max(0, start - 75), min(len(text), start + len(term) + 75)
                                    matches.append({
                                        "key": requested.display_name if page_number == 1 else f"{requested.display_name}#{page_number}",
                                        "file": requested.display_name,
                                        "page": page_number,
                                        "term": term,
                                        "start": start,
                                        "length": len(term),
                                        "context": text[context_start:context_end],
                                        "textBefore": text[context_start:start],
                                        "matchedText": text[start:start + len(term)],
                                        "textAfter": text[start + len(term):context_end],
                                        "documentId": None,
                                        "documentKey": searched["documentKey"],
                                        "pageDimensions": {"width": width, "height": height, "unit": "pdf_points"},
                                        "source": "runpod_pdf_text",
                                        "x": (x0 + char_width * start) / width,
                                        "y": y0 / height,
                                        "w": match_width / width,
                                        "h": max(1.0, y1 - y0) / height,
                                    })
    return {"matches": matches, "documents": documents, "compute": "runpod"}


@app.get("/{path:path}")
def web(path: str):
    candidate = (STATIC_DIR / path).resolve()
    if candidate == STATIC_DIR or STATIC_DIR in candidate.parents:
        if candidate.is_file():
            return FileResponse(candidate)
    index = STATIC_DIR / "index.html"
    return FileResponse(index) if index.is_file() else JSONResponse({"detail": "Web build unavailable."}, status_code=404)
