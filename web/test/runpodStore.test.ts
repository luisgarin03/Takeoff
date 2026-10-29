import test from "node:test";
import assert from "node:assert/strict";
import { createRunpodStore } from "../src/lib/runpodStore.js";

test("RunPod project storage namespaces and migrates a browser project once", async () => {
  const files = new Map<string, Uint8Array>();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input), name = decodeURIComponent(url.split("/").pop() || "");
    if (url.endsWith("/runpod/api/files")) {
      return Response.json({ files: [...files].map(([file, bytes]) => ({ name: file, size: bytes.length, modified: 1 })) });
    }
    if (init.method === "PUT") {
      files.set(name, new Uint8Array(await new Response(init.body).arrayBuffer()));
      return Response.json({ name });
    }
    const bytes = files.get(name);
    return bytes ? new Response(bytes) : new Response("missing", { status: 404 });
  }) as typeof fetch;
  try {
    let migrations = 0;
    const source = {
      async listSheets() { migrations++; return [{ name: "plans.pdf" }]; },
      async loadPdfData() { return new Uint8Array([37, 80, 68, 70]); },
      async loadAnnotations() { return { schema: "test", shapes: [{ id: "one" }] }; },
    };
    const store = createRunpodStore({ namespace: "abc", sourceStore: source as never });
    await store.prepare();
    assert.deepEqual(await store.listSheets(), [{ name: "plans.pdf", size: 4, modified: 1 }]);
    assert.equal((await store.loadAnnotations()).shapes[0].id, "one");
    assert.ok(files.has("rp-abc--plans.pdf"));
    assert.ok(files.has("rp-abc--workspace-annotations.json"));
    await store.prepare();
    assert.equal(migrations, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
