import { test } from "node:test";
import assert from "node:assert/strict";
import { SOURCE_FOLDER_NAME, findLocalSourceFolder, createLocalSourceFolder, localSourceFolderView } from "../src/lib/localDriveProject.js";

function directory(name: string, events: string[] = []) {
  const children = new Map<string, any>();
  const handle: any = { name, kind: "directory", children,
    requestPermission: async () => "granted",
    async getDirectoryHandle(child: string, options: {create?: boolean} = {}) {
      events.push(`${name}/${child}:${options.create ? "create" : "read"}`);
      if (!children.has(child)) {
        if (!options.create) throw new DOMException("Missing", "NotFoundError");
        children.set(child, directory(child, events));
      }
      const result = children.get(child);
      if (result.kind !== "directory") throw new DOMException("File", "TypeMismatchError");
      return result;
    },
    async *values() { events.push(`${name}:list`); yield* children.values(); },
  };
  return handle;
}
test("parent probe is read-only; confirmed creation uses only the fixed minimal structure", async () => {
  const events: string[] = [], parent = directory("My Drive", events);
  assert.equal(await findLocalSourceFolder(parent), null);
  assert.equal(parent.children.size, 0);
  const result = await createLocalSourceFolder(parent);
  assert.equal(result.exists, false);
  assert.deepEqual([...parent.children.keys()], [SOURCE_FOLDER_NAME]);
  assert.deepEqual([...result.handle.children.keys()], ["Projects"]);
  const view = await localSourceFolderView(result.handle, true);
  assert.equal(view.handle, result.handle);
  assert.deepEqual(view.trail.map((h: any) => h.name), [SOURCE_FOLDER_NAME, "Projects"]);
  assert.deepEqual(view.entries, []);
  assert.deepEqual(events.filter((e) => e.endsWith(":list")), ["Projects:list"]);
});
test("existing source requires explicit reuse and never creates a numbered duplicate", async () => {
  const events: string[] = [], parent = directory("Custom Drive Mount", events);
  const existing = directory(SOURCE_FOLDER_NAME, events); parent.children.set(SOURCE_FOLDER_NAME, existing);
  assert.equal(await findLocalSourceFolder(parent), existing);
  const pending = await createLocalSourceFolder(parent);
  assert.equal(pending.exists, true); assert.equal(existing.children.size, 0);
  const result = await createLocalSourceFolder(parent, true);
  assert.equal(result.handle, existing); assert.equal(result.exists, false);
  assert.deepEqual([...existing.children.keys()], ["Projects"]);
  assert.deepEqual([...parent.children.keys()], [SOURCE_FOLDER_NAME]);
});
test("a source appearing after the picker is detected before creating its Projects folder", async () => {
  const parent = directory("My Drive");
  assert.equal(await findLocalSourceFolder(parent), null);
  const existing = directory(SOURCE_FOLDER_NAME); parent.children.set(SOURCE_FOLDER_NAME, existing);
  assert.equal((await createLocalSourceFolder(parent)).exists, true);
  assert.equal(existing.children.size, 0);
});
test("unavailable, denied, conflicting and failed locations produce useful errors", async () => {
  const denied = directory("My Drive"); denied.requestPermission = async () => "denied";
  await assert.rejects(createLocalSourceFolder(denied), /Permission denied/);
  assert.equal(denied.children.size, 0);
  const missing = directory("My Drive");
  await assert.rejects(createLocalSourceFolder(missing, true), /location is unavailable/);
  assert.equal(missing.children.size, 0);
  const conflicting = directory("My Drive"); conflicting.children.set(SOURCE_FOLDER_NAME, { kind: "file" });
  await assert.rejects(findLocalSourceFolder(conflicting), /file is using the name/);
  await assert.rejects(createLocalSourceFolder({ getDirectoryHandle: async () => { throw new Error("private stack details"); } }), /could not create or validate/);
});
test("initial Projects view and restored view do not scan project subtrees", async () => {
  const parent = directory("My Drive"), { handle } = await createLocalSourceFolder(parent);
  const projects = await handle.getDirectoryHandle("Projects");
  projects.children.set("Existing Project", { name: "Existing Project", kind: "directory", values() { throw new Error("must not scan subtree"); } });
  const first = await localSourceFolderView(handle, true);
  const reopened = await localSourceFolderView(handle, first.browseProjects);
  assert.deepEqual(reopened.entries.map((e: any) => e.name), ["Existing Project"]);
});
test("failure to create required Projects does not remove or replace an existing source", async () => {
  const parent = directory("My Drive"); const existing = directory(SOURCE_FOLDER_NAME); parent.children.set(SOURCE_FOLDER_NAME, existing);
  existing.getDirectoryHandle = async () => { throw new DOMException("Write failed", "NotAllowedError"); };
  await assert.rejects(createLocalSourceFolder(parent, true), /Permission denied/);
  assert.equal(parent.children.get(SOURCE_FOLDER_NAME), existing);
});
