// Keep original ANI files intact; extract the first embedded CUR frame for browsers.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
const root = new URL("../public/cursors/", import.meta.url);
function firstFrame(data, start = 12, end = data.length) {
  for (let p = start; p + 8 <= end;) {
    const id = data.toString("ascii", p, p + 4), size = data.readUInt32LE(p + 4);
    if (p + 8 + size > end) throw new Error("Invalid ANI chunk");
    if (id === "icon") return data.subarray(p + 8, p + 8 + size);
    if (id === "LIST") { const frame = firstFrame(data, p + 12, p + 8 + size); if (frame) return frame; }
    p += 8 + size + (size % 2);
  }
}
for (const theme of readdirSync(root, { withFileTypes: true }).filter((f) => f.isDirectory())) {
  for (const name of ["chrome-busy", "chrome-working"]) {
    const frame = firstFrame(readFileSync(new URL(`${theme.name}/${name}.ani`, root)));
    if (!frame || frame.readUInt16LE(2) !== 2) throw new Error(`Expected CUR frame: ${theme.name}/${name}`);
    writeFileSync(new URL(`${theme.name}/${name}-static.cur`, root), frame);
  }
}
