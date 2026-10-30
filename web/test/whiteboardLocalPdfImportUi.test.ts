import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/components/Whiteboard.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const canvasSource = readFileSync(new URL("../src/pages/TakeoffCanvas.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const css = readFileSync(new URL("../src/styles/whiteboard.css", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("only multipage local Whiteboard PDFs ask whether to split pages or keep one navigable card", () => {
  assert.match(source, /async function queueLocalFiles\(list, at = null\)/);
  assert.match(source, /pdfs = files\.filter\(\(file\) => whiteboardFileType\(file\) === "application\/pdf"\)/);
  assert.match(source, /if \(doc\.numPages > 1\) \{ hasMultipagePdf = true; break; \}/);
  assert.match(source, /if \(hasMultipagePdf\) setPendingLocalImport\(\{ files, at \}\);\s*else await addFiles\(files, at\);/);
  assert.match(source, /How should the PDF pages be added\?/);
  assert.match(source, /finishLocalPdfChoice\("separate"\)[\s\S]*?Separate pages/);
  assert.match(source, /finishLocalPdfChoice\("combined"\)[\s\S]*?All pages in one/);
  assert.match(source, /pdfPageMode === "separate"[\s\S]*?Array\.from\(\{ length: doc\.numPages \}/);
  assert.match(source, /page: index \+ 1/);
});

test("local picker, paste, and drop use the PDF choice while Takeoff imports stay direct", () => {
  assert.match(source, /onChange=\{\(e\) => \{ queueLocalFiles\(e\.target\.files\)/);
  assert.match(source, /onDrop=\{\(e\) => \{[^}]*queueLocalFiles\(e\.dataTransfer\.files, point\(e\)\)/);
  assert.match(source, /if \(content\.files\.length\) queueLocalFiles\(content\.files, at\)/);
  assert.match(source, /addFiles\(initialFiles, null, \{ focusAdded: true, importAsPlan: true \}\)/);
  assert.match(css, /\.wb-import-choice-shade \{[^}]*position: fixed;[^}]*z-index: 80;/);
});

test("Takeoff imports finish their toast and can run while Whiteboard remains open", () => {
  assert.match(source, /return \{ addedFiles: assets\.length, addedItems: items\.length, errors \}/);
  assert.match(source, /onInitialFilesHandled\?\.\(result\)/);
  assert.match(source, /\}, \[initialFiles\]\)/);
  assert.match(canvasSource, /if \(result\?\.addedFiles > 0\) setCommitMsg\(`Imported \$\{importedName\} to the whiteboard\.`\)/);
  assert.match(canvasSource, /else setCommitMsg\(`Couldn't import \$\{importedName\} to the whiteboard/);
});
