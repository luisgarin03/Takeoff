// PDF compatibility gate shared by every path that can put a plan on screen.
// It deliberately validates bytes with pdf.js before the caller commits them
// to a project. Validation is local-only: no document or password leaves the
// browser, and passwords are returned only for the caller's in-memory cache.

export const PDF_COMPATIBILITY_CODES = Object.freeze({
  INVALID_FILE: "invalid-file",
  PASSWORD_REQUIRED: "password-required",
  INCORRECT_PASSWORD: "incorrect-password",
  UNSUPPORTED_PROTECTION: "unsupported-protection",
  INVALID_STRUCTURE: "invalid-structure",
  EMPTY_DOCUMENT: "empty-document",
  RENDER_FAILED: "render-failed",
  CANCELLED: "cancelled",
  UNKNOWN: "unknown",
});

export const PDF_COMPATIBILITY_VERSION = 1;
export const PDF_VALIDATION_MODES = Object.freeze({
  FULL: "full",
  QUICK: "quick",
  CACHED: "cached",
});

const MAX_VALIDATION_DIMENSION = 160;
const PDF_HEADER_LIMIT = 1024;
const OFFICE_PROTECTION_NOTICE = /(?:protected\s+by\s+Microsoft\s+(?:Office|Purview)|reader\s+you\s+are\s+using\s+does\s+not\s+support\s+opening\s+files\s+protected\s+by\s+Microsoft|this\s+PDF\s+file\s+is\s+protected)/i;

const safeMessage = (error) => String(error?.message || error || "Unknown PDF error").replace(/\s+/g, " ").trim().slice(0, 500);

export function hasPdfHeader(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  const limit = Math.min(data.length, PDF_HEADER_LIMIT);
  for (let i = 0; i + 4 < limit; i++) {
    if (data[i] === 0x25 && data[i + 1] === 0x50 && data[i + 2] === 0x44 && data[i + 3] === 0x46 && data[i + 4] === 0x2d) return true;
  }
  return false;
}
export function pdfByteSignature(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  let hash = 2166136261;
  const mix = (value) => { hash ^= value; hash = Math.imul(hash, 16777619); };
  const sample = Math.min(4096, data.length);
  for (let i = 0; i < sample; i++) mix(data[i]);
  for (let i = Math.max(sample, data.length - sample); i < data.length; i++) mix(data[i]);
  mix(data.length & 255); mix((data.length >>> 8) & 255); mix((data.length >>> 16) & 255); mix((data.length >>> 24) & 255);
  return `${data.length}:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function protectionNoticeText(text) {
  return OFFICE_PROTECTION_NOTICE.test(String(text || ""));
}

export function pdfCompatibilityFailure(code, technical = "", extras = {}) {
  const reasons = {
    [PDF_COMPATIBILITY_CODES.INVALID_FILE]: "Not a valid PDF file",
    [PDF_COMPATIBILITY_CODES.PASSWORD_REQUIRED]: "Password required",
    [PDF_COMPATIBILITY_CODES.INCORRECT_PASSWORD]: "The PDF password was incorrect",
    [PDF_COMPATIBILITY_CODES.UNSUPPORTED_PROTECTION]: "Unsupported PDF protection",
    [PDF_COMPATIBILITY_CODES.INVALID_STRUCTURE]: "Invalid or corrupted PDF structure",
    [PDF_COMPATIBILITY_CODES.EMPTY_DOCUMENT]: "The PDF contains no pages",
    [PDF_COMPATIBILITY_CODES.RENDER_FAILED]: "A PDF page could not be rendered",
    [PDF_COMPATIBILITY_CODES.CANCELLED]: "Import cancelled",
    [PDF_COMPATIBILITY_CODES.UNKNOWN]: "The PDF is incompatible with the viewer",
  };
  return { ok: false, code, reason: reasons[code] || reasons[PDF_COMPATIBILITY_CODES.UNKNOWN], technical: String(technical || "").slice(0, 500), ...extras };
}

export function classifyPdfError(error, { passwordState = "", pageNumber = null } = {}) {
  const name = String(error?.name || "");
  const message = safeMessage(error);
  // Destroying a loading task is how the password callback declines/cancels a
  // prompt, and pdf.js reports that as AbortException. Preserve the useful
  // password classification before applying the generic cancellation rule.
  if (passwordState === "incorrect") return pdfCompatibilityFailure(PDF_COMPATIBILITY_CODES.INCORRECT_PASSWORD, message, { retryable: true });
  if (passwordState === "required" || name === "PasswordException") return pdfCompatibilityFailure(PDF_COMPATIBILITY_CODES.PASSWORD_REQUIRED, message, { retryable: true });
  if (name === "AbortException" || error?.code === PDF_COMPATIBILITY_CODES.CANCELLED) {
    return pdfCompatibilityFailure(PDF_COMPATIBILITY_CODES.CANCELLED, message);
  }
  if (name === "InvalidPDFException" || /invalid pdf|invalid.*structure|xref|trailer|catalog/i.test(message)) {
    return pdfCompatibilityFailure(PDF_COMPATIBILITY_CODES.INVALID_STRUCTURE, message);
  }
  if (/unsupported.*(?:encryption|security|protection)|unknown encryption|Microsoft (?:Office|Purview)/i.test(message)) {
    return pdfCompatibilityFailure(PDF_COMPATIBILITY_CODES.UNSUPPORTED_PROTECTION, message);
  }
  if (pageNumber != null) return pdfCompatibilityFailure(PDF_COMPATIBILITY_CODES.RENDER_FAILED, message, { pageNumber });
  return pdfCompatibilityFailure(PDF_COMPATIBILITY_CODES.UNKNOWN, message);
}

function abortError() {
  const error = new Error("PDF validation was cancelled.");
  error.name = "AbortException";
  error.code = PDF_COMPATIBILITY_CODES.CANCELLED;
  return error;
}

function waitForTurn() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

function defaultCanvasFactory(width, height) {
  if (typeof document === "undefined") throw new Error("PDF rendering is unavailable in this environment.");
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("A PDF validation canvas could not be created.");
  return { canvas, context, dispose: () => { canvas.width = 0; canvas.height = 0; } };
}

/**
 * Parse a PDF and minimally render either its first page (quick mode) or every
 * page (full mode) before the caller makes it available.
 * A document remains usable when at least one page renders: PDF.js can often
 * still extract/search text from a page whose image decoder it cannot paint,
 * and one unusual page must not hide all readable pages in the plan set.
 * `pdfjs` and `canvasFactory` are injectable so the policy is unit-testable.
 * @param {Uint8Array|ArrayBuffer} bytes
 * @param {any} [options]
 */
export async function validatePdfBytes(bytes, options = {}) {
  const { pdfjs, fileName = "PDF", requestPassword, initialPassword = "", onProgress, signal,
    canvasFactory = defaultCanvasFactory, keepDocument = false, maxRenderDimension = MAX_VALIDATION_DIMENSION,
    validationMode = PDF_VALIDATION_MODES.FULL } = options;
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  if (!source.length || !hasPdfHeader(source)) return pdfCompatibilityFailure(PDF_COMPATIBILITY_CODES.INVALID_FILE, "The %PDF header was not found.");
  if (!pdfjs?.getDocument) return pdfCompatibilityFailure(PDF_COMPATIBILITY_CODES.UNKNOWN, "The PDF viewer is unavailable.");
  if (signal?.aborted) return pdfCompatibilityFailure(PDF_COMPATIBILITY_CODES.CANCELLED);

  let loadingTask = null;
  let document = null;
  let password = initialPassword || "";
  let passwordState = "";
  let passwordRequests = 0;
  let succeeded = false;
  const onAbort = () => { try { loadingTask?.destroy(); } catch { /* already closed */ } };
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    loadingTask = pdfjs.getDocument({ data: source.slice(), password: password || undefined, isEvalSupported: false, stopAtErrors: false });
    loadingTask.onPassword = async (updatePassword, reason) => {
      const incorrect = reason === pdfjs.PasswordResponses?.INCORRECT_PASSWORD;
      passwordState = incorrect ? "incorrect" : "required";
      passwordRequests++;
      if (!requestPassword || signal?.aborted) { try { await loadingTask.destroy(); } catch { /* expected */ } return; }
      const supplied = await requestPassword({ fileName, incorrect, attempt: passwordRequests });
      if (supplied == null || signal?.aborted) { try { await loadingTask.destroy(); } catch { /* expected */ } return; }
      password = String(supplied);
      updatePassword(password);
    };
    document = await loadingTask.promise;
    passwordState = "";
    if (!Number.isInteger(document.numPages) || document.numPages < 1) return pdfCompatibilityFailure(PDF_COMPATIBILITY_CODES.EMPTY_DOCUMENT);

    if (validationMode === PDF_VALIDATION_MODES.CACHED) {
      const result = { ok: true, pageCount: document.numPages, password, document: keepDocument ? document : null,
        unrenderablePages: [], renderWarnings: [], validationMode, fullyValidated: false, validatedPages: [],
        byteLength: source.byteLength, signature: pdfByteSignature(source) };
      succeeded = true;
      if (!keepDocument) { await document.destroy(); document = null; }
      return result;
    }

    const renderFailures = [];
    let renderedPages = 0;
    // Fast mode exists to get the estimator onto the visible plan quickly.
    // Validate only the first page up front; later pages are rendered normally
    // when visited instead of making every import wait on hidden preflight work.
    const validationPageCount = validationMode === PDF_VALIDATION_MODES.QUICK
      ? Math.min(1, document.numPages)
      : document.numPages;
    for (let pageNumber = 1; pageNumber <= validationPageCount; pageNumber++) {
      if (signal?.aborted) throw abortError();
      onProgress?.({ fileName, pageNumber, pageCount: document.numPages });
      let page = null;
      let surface = null;
      let renderTask = null;
      let renderFailure = null;
      try {
        page = await document.getPage(pageNumber);
        const base = page.getViewport({ scale: 1 });
        if (!(base.width > 0) || !(base.height > 0) || !Number.isFinite(base.width) || !Number.isFinite(base.height)) throw new Error("The page has invalid dimensions.");
        const scale = Math.min(1, maxRenderDimension / Math.max(base.width, base.height));
        const viewport = page.getViewport({ scale: Math.max(.01, scale) });
        surface = canvasFactory(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
        renderTask = page.render({ canvasContext: surface.context, viewport, annotationMode: pdfjs.AnnotationMode?.ENABLE });
        await renderTask.promise;
        renderedPages++;
      } catch (error) {
        try { renderTask?.cancel(); } catch { /* already settled */ }
        if (signal?.aborted) throw abortError();
        renderFailure = classifyPdfError(error, { pageNumber });
      }
      try {
        // Office/Purview-protected files are sometimes a valid one-page PDF
        // wrapper containing only an incompatibility notice. Treat that known
        // notice as protection metadata, not as a successfully renderable plan.
        // Attempt this even after a paint failure because text extraction can
        // still succeed independently of an unsupported embedded image codec.
        if (page && pageNumber <= Math.min(3, document.numPages)) {
          const text = await page.getTextContent().catch(() => null);
          const visible = (text?.items || []).map((item) => item?.str || "").join(" ");
          if (protectionNoticeText(visible)) return pdfCompatibilityFailure(PDF_COMPATIBILITY_CODES.UNSUPPORTED_PROTECTION, visible.slice(0, 500));
        }
      } finally {
        try { surface?.dispose?.(); } catch { /* best-effort memory release */ }
        try { page?.cleanup?.(); } catch { /* best-effort worker release */ }
      }
      if (renderFailure) renderFailures.push({ pageNumber, code: renderFailure.code, technical: renderFailure.technical });
      if (pageNumber < validationPageCount) await waitForTurn();
    }
    if (!renderedPages && validationMode !== PDF_VALIDATION_MODES.QUICK) {
      const first = renderFailures[0] || pdfCompatibilityFailure(PDF_COMPATIBILITY_CODES.RENDER_FAILED, "No page could be rendered.", { pageNumber: 1 });
      return pdfCompatibilityFailure(first.code || PDF_COMPATIBILITY_CODES.RENDER_FAILED, first.technical, {
        pageNumber: first.pageNumber || 1,
        unrenderablePages: renderFailures.map(({ pageNumber }) => pageNumber),
      });
    }
    const result = { ok: true, pageCount: document.numPages, password, document: keepDocument ? document : null,
      unrenderablePages: renderFailures.map(({ pageNumber }) => pageNumber), renderWarnings: renderFailures,
      validationMode, fullyValidated: validationMode === PDF_VALIDATION_MODES.FULL,
      validatedPages: Array.from({ length: validationPageCount }, (_, index) => index + 1),
      byteLength: source.byteLength, signature: pdfByteSignature(source) };
    succeeded = true;
    if (!keepDocument) { await document.destroy(); document = null; }
    return result;
  } catch (error) {
    if (signal?.aborted) return pdfCompatibilityFailure(PDF_COMPATIBILITY_CODES.CANCELLED);
    return classifyPdfError(error, { passwordState });
  } finally {
    signal?.removeEventListener("abort", onAbort);
    // A failed validation never transfers ownership of the pdf.js document,
    // even when the caller requested keepDocument for the success path.
    if (document && (!keepDocument || !succeeded)) { try { await document.destroy(); } catch { /* already closed */ } }
  }
}

export function pdfCompatibilityRecord(result, now = Date.now()) {
  if (!result?.ok) return null;
  return {
    version: PDF_COMPATIBILITY_VERSION,
    mode: result.fullyValidated ? PDF_VALIDATION_MODES.FULL : PDF_VALIDATION_MODES.QUICK,
    pageCount: Number(result.pageCount) || 0,
    unrenderablePages: Array.isArray(result.unrenderablePages) ? [...result.unrenderablePages] : [],
    byteLength: Number(result.byteLength) || 0,
    signature: String(result.signature || ""),
    verifiedAt: Number(now) || Date.now(),
  };
}

/** @param {any} record @param {{requireFull?: boolean, bytes?: Uint8Array|ArrayBuffer|null}} [options] */
export function isCurrentPdfCompatibility(record, { requireFull = false, bytes = null } = {}) {
  if (!record || record.version !== PDF_COMPATIBILITY_VERSION) return false;
  if (record.mode !== PDF_VALIDATION_MODES.FULL && record.mode !== PDF_VALIDATION_MODES.QUICK) return false;
  if (bytes && record.signature !== pdfByteSignature(bytes)) return false;
  return !requireFull || record.mode === PDF_VALIDATION_MODES.FULL;
}

export async function validatePdfFile(file, options = {}) {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return await validatePdfBytes(bytes, { ...options, fileName: file.name || options.fileName || "PDF" });
  } catch (error) {
    return classifyPdfError(error);
  }
}
