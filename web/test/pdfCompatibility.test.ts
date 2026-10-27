import test from "node:test";
import assert from "node:assert/strict";
import {
  PDF_COMPATIBILITY_CODES,
  classifyPdfError,
  hasPdfHeader,
  isCurrentPdfCompatibility,
  pdfByteSignature,
  pdfCompatibilityRecord,
  PDF_VALIDATION_MODES,
  protectionNoticeText,
  validatePdfBytes,
} from "../src/lib/pdfCompatibility.js";

const bytes = (body = "ok") => new TextEncoder().encode(`%PDF-1.7\n${body}\n%%EOF`);
const canvasFactory = () => ({ canvas: {} as HTMLCanvasElement, context: {} as CanvasRenderingContext2D, dispose() {} });

function page({ text = "Floor plan", renderError = null }: { text?: string; renderError?: Error | null } = {}) {
  return {
    getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 400 * scale }),
    render: () => ({ promise: renderError ? Promise.reject(renderError) : Promise.resolve(), cancel() {} }),
    getTextContent: async () => ({ items: [{ str: text }] }),
    cleanup() {},
  };
}

function pdfjs(pages: ReturnType<typeof page>[], onDestroy = () => {}) {
  return {
    AnnotationMode: { ENABLE: 1 },
    PasswordResponses: { NEED_PASSWORD: 1, INCORRECT_PASSWORD: 2 },
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: pages.length,
        getPage: async (number: number) => pages[number - 1],
        destroy: async () => onDestroy(),
      }),
      destroy: async () => {},
      onPassword: null,
    }),
  };
}

test("PDF compatibility helpers recognize headers, protected wrapper notices, and structured errors", () => {
  assert.equal(hasPdfHeader(new TextEncoder().encode("prefix\n%PDF-1.6\n")), true);
  assert.equal(hasPdfHeader(new TextEncoder().encode("not a pdf")), false);
  assert.equal(protectionNoticeText("This PDF file is protected by Microsoft Purview"), true);
  assert.equal(classifyPdfError({ name: "InvalidPDFException", message: "Invalid PDF structure" }).code, PDF_COMPATIBILITY_CODES.INVALID_STRUCTURE);
  assert.equal(classifyPdfError({ name: "AbortException" }, { passwordState: "required" }).code, PDF_COMPATIBILITY_CODES.PASSWORD_REQUIRED);
});

test("validation minimally renders every page, reports progress, and releases the document", async () => {
  const progress: number[] = [];
  let destroyed = 0;
  const result = await validatePdfBytes(bytes(), {
    pdfjs: pdfjs([page(), page()], () => destroyed++),
    canvasFactory,
    onProgress: ({ pageNumber }: { pageNumber: number }) => progress.push(pageNumber),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(progress, [1, 2]);
  assert.equal(destroyed, 1);
});

test("validation excludes malformed files, wholly unreadable documents, and Microsoft protection wrappers", async () => {
  assert.equal((await validatePdfBytes(new Uint8Array([1, 2, 3]), { pdfjs: pdfjs([]), canvasFactory }) as any).code, PDF_COMPATIBILITY_CODES.INVALID_FILE);

  let failedDestroyed = 0;
  const failed = await validatePdfBytes(bytes(), {
    pdfjs: pdfjs([page({ renderError: new Error("decoder failed") })], () => failedDestroyed++),
    canvasFactory,
    keepDocument: true,
  });
  assert.equal((failed as any).code, PDF_COMPATIBILITY_CODES.RENDER_FAILED);
  assert.equal((failed as any).pageNumber, 1);
  assert.deepEqual((failed as any).unrenderablePages, [1]);
  assert.equal(failedDestroyed, 1, "failed keepDocument validation must not leak its worker document");

  let wrapperDestroyed = 0;
  const wrapper = await validatePdfBytes(bytes(), {
    pdfjs: pdfjs([page({ text: "This PDF file is protected by Microsoft Office." })], () => wrapperDestroyed++),
    canvasFactory,
    keepDocument: true,
  });
  assert.equal((wrapper as any).code, PDF_COMPATIBILITY_CODES.UNSUPPORTED_PROTECTION);
  assert.equal(wrapperDestroyed, 1);
});

test("one failed page no longer rejects readable pages or blocks the searchable document", async () => {
  let destroyed = 0;
  const result = await validatePdfBytes(bytes(), {
    pdfjs: pdfjs([page({ renderError: new Error("unsupported image decoder") }), page({ text: "FENCE" })], () => destroyed++),
    canvasFactory,
    keepDocument: true,
  });
  assert.equal(result.ok, true);
  assert.deepEqual((result as any).unrenderablePages, [1]);
  assert.equal((result as any).renderWarnings[0].technical, "unsupported image decoder");
  assert.ok((result as any).document, "the caller receives the document so Find can extract text from its readable pages");
  assert.equal(destroyed, 0);
  await (result as any).document.destroy();
  assert.equal(destroyed, 1);
});

test("successful keepDocument validation transfers document ownership to the caller", async () => {
  let destroyed = 0;
  const result = await validatePdfBytes(bytes(), {
    pdfjs: pdfjs([page()], () => destroyed++),
    canvasFactory,
    keepDocument: true,
  });
  assert.equal(result.ok, true);
  assert.ok((result as any).document);
  assert.equal(destroyed, 0);
  await (result as any).document.destroy();
  assert.equal(destroyed, 1);
});

test("quick validation checks only the first page and permits deferred page failures", async () => {
  const progress: number[] = [];
  const result = await validatePdfBytes(bytes("quick"), {
    pdfjs: pdfjs([
      page({ renderError: new Error("first page decoder") }),
      page(), page(), page(), page(),
    ]),
    canvasFactory,
    validationMode: PDF_VALIDATION_MODES.QUICK,
    onProgress: ({ pageNumber }: { pageNumber: number }) => progress.push(pageNumber),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(progress, [1]);
  assert.equal((result as any).fullyValidated, false);
  assert.deepEqual((result as any).unrenderablePages, [1]);
});

test("cached validation parses without rendering and compatibility records detect changed bytes", async () => {
  let renders = 0;
  const cachedPage = page();
  cachedPage.render = () => { renders++; return { promise: Promise.resolve(), cancel() {} }; };
  const source = bytes("cached");
  const result = await validatePdfBytes(source, {
    pdfjs: pdfjs([cachedPage]),
    canvasFactory,
    validationMode: PDF_VALIDATION_MODES.CACHED,
  });
  assert.equal(result.ok, true);
  assert.equal(renders, 0);

  const verified = pdfCompatibilityRecord({ ...result, validationMode: PDF_VALIDATION_MODES.FULL, fullyValidated: true });
  assert.equal(isCurrentPdfCompatibility(verified, { requireFull: true, bytes: source }), true);
  assert.equal(isCurrentPdfCompatibility(verified, { requireFull: true, bytes: bytes("changed") }), false);
  assert.notEqual(pdfByteSignature(source), pdfByteSignature(bytes("changed")));
});
