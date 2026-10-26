import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const canvas = readFileSync(new URL("../src/pages/TakeoffCanvas.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const dialog = readFileSync(new URL("../src/components/SaveProjectDialog.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("a named local project offers a destination or an explicit save-later path after plan import", () => {
  assert.match(canvas, /if \(!cloudWorkspace && projectName\.trim\(\) && !destination\)[\s\S]{0,400}setProjectSaveRequired\(true\)[\s\S]{0,250}setProjectSavePrompt\(projectFilename\(projectName\)\)/);
  assert.match(canvas, /<SaveProjectDialog[\s\S]{0,300}required=\{projectSaveRequired\}/);
  assert.match(dialog, /required && <p[\s\S]{0,300}save it later and continue working[\s\S]{0,200}browser recovery storage/);
  assert.match(dialog, /\{!required && <button[\s\S]{0,180}>Cancel<\/button>\}/);
  assert.match(dialog, /\{required && onSaveLater && <button[\s\S]{0,180}>Save later<\/button>\}/);
  assert.match(canvas, /onSaveLater=\{\(\) => \{[\s\S]{0,200}setProjectSavePrompt\(null\)[\s\S]{0,200}setProjectSaveRequired\(false\)/);
});

test("fast browser recovery saves schedule a coalesced portable-file autosave", () => {
  assert.match(canvas, /store\.saveAnnotations\(payload\)\.then\(\(\) => \{[\s\S]{0,300}scheduleProjectFileAutosave\(payload\)/);
  assert.match(canvas, /requestIdleCallback\(run, \{ timeout: 15_000 \}\)/);
  assert.match(canvas, /if \(projectFileLock\.current \|\| projectFileAutosaveBusyRef\.current\)[\s\S]{0,120}armProjectFileAutosaveWakeup\(5_000\)/);
  assert.match(canvas, /canAutosaveProjectFile\(handle\)[\s\S]{0,500}exportProjectFile\(store, payload\)/);
});
