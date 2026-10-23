import assert from "node:assert/strict";
import test from "node:test";
import { canAutosaveProjectFile, projectFileAutosaveDelay, projectFileHandleStorageKey } from "../src/lib/projectFileAutosave.js";

test("portable autosave waits for quiet work but has a continuous-work deadline", () => {
  assert.equal(projectFileAutosaveDelay(10_000, 10_000), 30_000);
  assert.equal(projectFileAutosaveDelay(100_000, 10_000), 30_000);
  assert.equal(projectFileAutosaveDelay(125_000, 10_000), 5_000);
  assert.equal(projectFileAutosaveDelay(140_000, 10_000), 0);
});

test("background project-file saves never request permission", async () => {
  let requests = 0;
  const promptHandle = {
    createWritable() {},
    queryPermission: async () => "prompt",
    requestPermission: async () => { requests++; return "granted"; },
  };
  assert.equal(await canAutosaveProjectFile(promptHandle), false);
  assert.equal(requests, 0);
  assert.equal(await canAutosaveProjectFile({ createWritable() {}, queryPermission: async () => "granted" }), true);
  assert.equal(await canAutosaveProjectFile({ createWritable() {} }), true);
  assert.equal(await canAutosaveProjectFile(null), false);
});

test("retained handles are isolated by portable project id", () => {
  assert.equal(projectFileHandleStorageKey(" project-a "), "portable-project-file-handle:project-a");
  assert.equal(projectFileHandleStorageKey(""), "");
});
