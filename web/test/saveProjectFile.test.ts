import { test } from "node:test";
import assert from "node:assert/strict";
import { projectFileHandleFor, projectSaveFilename, saveProjectArchive } from "../src/lib/saveProjectFile.js";

test("a retained local file handle is reusable only by the project that selected it", () => {
  const handle = { name: "Previous project.otk" };
  assert.equal(projectFileHandleFor(handle, "project-a", "project-a"), handle);
  assert.equal(projectFileHandleFor(handle, "project-a", "project-b"), null);
  assert.equal(projectFileHandleFor(handle, null, "project-a"), null);
});

test("save names accept an optional extension and sanitize invalid filename characters", () => {
  assert.equal(projectSaveFilename(" My project.OTK "), "My project.otk");
  assert.equal(projectSaveFilename("Job: 12/Phase A"), "Job_ 12_Phase A.otk");
  assert.throws(() => projectSaveFilename("   "), /Name the project/);
});

test("a retained file handle makes normal Save one click while Save As picks again", async () => {
  let picks = 0, writes = 0;
  const retained = { name: "Bid Center.otk", createWritable: async () => ({ write: async () => { writes++; }, close: async () => {} }) };
  const pickFile = async () => { picks++; return retained; };
  const first: any = await saveProjectArchive({ name: "Bid Center", buildArchive: async () => new Uint8Array([1]), pickFile, download: async () => {} });
  assert.equal(first.handle, retained); assert.equal(picks, 1); assert.equal(writes, 1);
  await saveProjectArchive({ name: "Bid Center", buildArchive: async () => new Uint8Array([2]), pickFile, download: async () => {}, existingHandle: first.handle });
  assert.equal(picks, 1); assert.equal(writes, 2);
  await saveProjectArchive({ name: "Bid Center Renamed", buildArchive: async () => new Uint8Array([3]), pickFile, download: async () => {}, existingHandle: first.handle, saveAs: true });
  assert.equal(picks, 2); assert.equal(writes, 3);
});

test("native save picks before any async archive work and finishes only after closing", async () => {
  const calls: string[] = [], bytes = new Uint8Array([1, 2, 3]);
  const saving = saveProjectArchive({
    name: "Job.otk",
    pickFile: async (options: any) => {
      calls.push("pick");
      assert.equal(options.suggestedName, "Job.otk");
      assert.deepEqual(options.types[0].accept, { "application/octet-stream": [".otk"] });
      return { name: "Chosen name.otk", createWritable: async () => ({
        write: async (data: Uint8Array) => { calls.push("write"); assert.equal(data, bytes); },
        close: async () => { calls.push("close"); },
      }) };
    },
    buildArchive: async () => { calls.push("build"); return bytes; },
    download: () => assert.fail("Native save must not download another copy"),
  });
  assert.deepEqual(calls, ["pick"]);
  const result: any = await saving;
  assert.equal(result.status, "saved"); assert.equal(result.filename, "Chosen name.otk"); assert.ok(result.handle);
  assert.deepEqual(calls, ["pick", "build", "write", "close"]);
});

test("cancelling the picker neither exports nor downloads", async () => {
  assert.deepEqual(await saveProjectArchive({ name: "Job",
    pickFile: async () => { throw new DOMException("Cancelled", "AbortError"); },
    buildArchive: () => assert.fail("Cancelled"), download: () => assert.fail("Cancelled"),
  }), { status: "cancelled" });
});

test("unsupported browsers download using the requested filename", async () => {
  const bytes = new Uint8Array([4, 5]);
  const result = await saveProjectArchive({ name: "Custom name", pickFile: null,
    buildArchive: async () => bytes,
    download: (name: string, data: Uint8Array, type: string) => {
      assert.equal(name, "Custom name.otk"); assert.equal(data, bytes); assert.equal(type, "application/octet-stream");
    },
  });
  assert.deepEqual(result, { status: "downloaded", filename: "Custom name.otk" });
});

test("picker permission failures are reported instead of silently downloading", async () => {
  const denied = new DOMException("Not allowed", "SecurityError");
  await assert.rejects(saveProjectArchive({ name: "Job", pickFile: async () => { throw denied; },
    buildArchive: () => assert.fail("Denied"), download: () => assert.fail("Denied"),
  }), (error) => error === denied);
});

test("archive failure does not open an output stream", async () => {
  await assert.rejects(saveProjectArchive({ name: "Job",
    pickFile: async () => ({ createWritable: () => assert.fail("No archive to write") }),
    buildArchive: async () => { throw new Error("Archive failed"); }, download: () => assert.fail(),
  }), /Archive failed/);
});

for (const failure of ["write", "close"]) {
  test(`a ${failure} failure aborts the stream and never reports success`, async () => {
    const calls: string[] = [];
    await assert.rejects(saveProjectArchive({ name: "Job",
      pickFile: async () => ({ createWritable: async () => ({
        write: async () => { calls.push("write"); if (failure === "write") throw new Error("Disk full"); },
        close: async () => { calls.push("close"); if (failure === "close") throw new Error("Disk full"); },
        abort: async () => { calls.push("abort"); },
      }) }),
      buildArchive: async () => new Uint8Array(), download: () => assert.fail(),
    }), /Disk full/);
    assert.equal(calls.at(-1), "abort");
  });
}
