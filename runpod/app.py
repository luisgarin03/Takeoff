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
import time
from pathlib import Path
from typing import Literal

import fitz
import numpy as np
import torch
import torch.nn.functional as torch_functional
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


class SymbolBox(BaseModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    w: float = Field(gt=0, le=1)
    h: float = Field(gt=0, le=1)


class SymbolPage(BaseModel):
    file: str
    display_name: str
    page: int = Field(ge=1)


class SymbolSearchRequest(BaseModel):
    source: SymbolPage
    box: SymbolBox
    target: SymbolPage
    threshold: float = Field(default=0.92, ge=0.5, le=0.999)
    rotations: list[int] = Field(default_factory=lambda: [0], min_length=1, max_length=4)
    scales: list[float] = Field(default_factory=lambda: [0.85, 1.0, 1.15], min_length=1, max_length=5)
    limit: int = Field(default=250, ge=1, le=1000)


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
    gpu_available = torch.cuda.is_available()
    return {
        "ok": True,
        "service": "opentakeoff-runpod",
        "storage_configured": bool(TOKEN) or PUBLIC_STORAGE,
        "storage_mode": "public-test" if PUBLIC_STORAGE else "token" if TOKEN else "disabled",
        "gpu_available": gpu_available,
        "compute_device": "cuda" if gpu_available else "cpu",
        "gpu_name": torch.cuda.get_device_name(0) if gpu_available else None,
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


def render_binary_page(path: Path, page_number: int, max_dimension: int = 1600) -> tuple[torch.Tensor, float]:
    with fitz.open(path) as document:
        if page_number < 1 or page_number > document.page_count:
            raise HTTPException(status_code=404, detail="PDF page not found.")
        page = document.load_page(page_number - 1)
        scale = max_dimension / max(page.rect.width, page.rect.height, 1)
        pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), colorspace=fitz.csGRAY, alpha=False)
    raster = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(pixmap.height, pixmap.width, pixmap.n)[..., 0]
    binary = torch.from_numpy((raster < 190).astype(np.float32, copy=False)).unsqueeze(0).unsqueeze(0)
    return binary, scale


def crop_symbol_tensor(image: torch.Tensor, box: SymbolBox) -> torch.Tensor:
    height, width = image.shape[-2:]
    x = max(0, min(width - 1, int(box.x * width)))
    y = max(0, min(height - 1, int(box.y * height)))
    w = max(1, min(width - x, int(np.ceil(box.w * width))))
    h = max(1, min(height - y, int(np.ceil(box.h * height))))
    if w < 8 or h < 8 or w > 300 or h > 300:
        raise HTTPException(status_code=400, detail="Select one symbol between 8 and 300 pixels wide and high.")
    template = image[..., y:y + h, x:x + w]
    ink = float(template.sum())
    if ink < 8 or ink / (w * h) > 0.8:
        raise HTTPException(status_code=400, detail="Select a visible symbol with some white space around it.")
    return template


def suppress_symbol_overlaps(candidates: list[dict], limit: int) -> tuple[list[dict], bool]:
    kept: list[dict] = []
    for hit in sorted(candidates, key=lambda item: item["score"], reverse=True):
        overlaps = False
        for other in kept:
            overlap = max(0, min(hit["x"] + hit["w"], other["x"] + other["w"]) - max(hit["x"], other["x"]))
            overlap *= max(0, min(hit["y"] + hit["h"], other["y"] + other["h"]) - max(hit["y"], other["y"]))
            if overlap / min(hit["w"] * hit["h"], other["w"] * other["h"]) > 0.35:
                overlaps = True
                break
        if not overlaps:
            kept.append(hit)
            if len(kept) > limit:
                return kept[:limit], True
    return kept, False


def gpu_symbol_match(
    image: torch.Tensor,
    template: torch.Tensor,
    threshold: float,
    scales: list[float],
    rotations: list[int],
    limit: int,
) -> tuple[list[dict], bool, str, float]:
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    started = time.perf_counter()
    image = image.to(device, non_blocking=True)
    template = template.to(device, non_blocking=True)
    height, width = image.shape[-2:]
    candidates: list[dict] = []
    candidate_cap_reached = False
    with torch.inference_mode():
        for rotation in rotations:
            rotated = torch.rot90(template, k=(rotation % 360) // 90, dims=(-2, -1))
            for scale in scales:
                variant_height = max(4, round(rotated.shape[-2] * scale))
                variant_width = max(4, round(rotated.shape[-1] * scale))
                if variant_height > height or variant_width > width:
                    continue
                variant = torch_functional.interpolate(rotated, size=(variant_height, variant_width), mode="nearest")
                foreground = variant
                background = 1 - variant
                foreground_count = float(foreground.sum())
                if foreground_count < 1:
                    continue
                background_count = float(background.sum())
                kernels = torch.cat((foreground, background, torch.ones_like(foreground)), dim=0)
                correct, clear, mass = torch_functional.conv2d(image, kernels).squeeze(0)
                recall = correct / foreground_count
                clarity = clear / background_count if background_count else torch.ones_like(clear)
                scores = recall * 0.7 + clarity * 0.3
                valid = (
                    (mass >= foreground_count * 0.55)
                    & (mass <= foreground_count * 1.65)
                    & (recall >= threshold - 0.15)
                    & (scores >= threshold)
                )
                flat = torch.where(valid, scores, torch.full_like(scores, -1)).flatten()
                match_count = int(valid.sum().item())
                if not match_count:
                    continue
                take = min(10000 - len(candidates), match_count)
                if take <= 0:
                    candidate_cap_reached = True
                    break
                values, indices = torch.topk(flat, k=take)
                output_width = scores.shape[-1]
                for score, index in zip(values.cpu().tolist(), indices.cpu().tolist()):
                    y, x = divmod(index, output_width)
                    candidates.append({
                        "score": score,
                        "x": x / width,
                        "y": y / height,
                        "w": variant_width / width,
                        "h": variant_height / height,
                        "scale": scale,
                        "rotation": rotation,
                    })
                if len(candidates) >= 10000:
                    candidate_cap_reached = True
                    break
            if candidate_cap_reached:
                break
    if device.type == "cuda":
        torch.cuda.synchronize()
    matches, nms_limited = suppress_symbol_overlaps(candidates, limit)
    return matches, candidate_cap_reached or nms_limited, device.type, (time.perf_counter() - started) * 1000


@app.post("/runpod/api/symbol-search")
def search_pdf_symbols(payload: SymbolSearchRequest, authorization: str | None = Header(default=None)) -> dict:
    authorize(authorization)
    rotations = sorted({rotation % 360 for rotation in payload.rotations if rotation % 90 == 0})
    if not rotations:
        raise HTTPException(status_code=400, detail="Symbol rotations must be quarter turns.")
    source_image, source_scale = render_binary_page(pdf_path(payload.source.file), payload.source.page)
    target_image, target_scale = render_binary_page(pdf_path(payload.target.file), payload.target.page)
    template = crop_symbol_tensor(source_image, payload.box)
    relative_scales = [max(0.25, min(4, value * target_scale / source_scale)) for value in payload.scales]
    matches, limited, device, elapsed_ms = gpu_symbol_match(
        target_image,
        template,
        payload.threshold,
        relative_scales,
        rotations,
        payload.limit,
    )
    return {
        "matches": matches,
        "limited": limited,
        "compute": "runpod",
        "device": device,
        "gpu_name": torch.cuda.get_device_name(0) if device == "cuda" else None,
        "elapsed_ms": round(elapsed_ms, 1),
        "target": {"file": payload.target.display_name, "page": payload.target.page},
    }


@app.get("/{path:path}")
def web(path: str):
    candidate = (STATIC_DIR / path).resolve()
    if candidate == STATIC_DIR or STATIC_DIR in candidate.parents:
        if candidate.is_file():
            return FileResponse(candidate)
    index = STATIC_DIR / "index.html"
    return FileResponse(index) if index.is_file() else JSONResponse({"detail": "Web build unavailable."}, status_code=404)
