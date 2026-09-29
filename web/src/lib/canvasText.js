// Wrap estimating-canvas notes into predictable screen-sized annotation boxes.
export function wrapCanvasNoteText(value, maxChars = 42) {
  const lines = [];
  for (const paragraph of String(value || "").split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(""); continue; }
    let line = "";
    for (const word of words) {
      if (word.length > maxChars) {
        if (line) { lines.push(line); line = ""; }
        for (let offset = 0; offset < word.length; offset += maxChars) {
          const part = word.slice(offset, offset + maxChars);
          if (offset + maxChars < word.length) lines.push(part);
          else line = part;
        }
        continue;
      }
      if (line && line.length + word.length + 1 > maxChars) { lines.push(line); line = word; }
      else line += `${line ? " " : ""}${word}`;
    }
    lines.push(line);
  }
  return lines.length ? lines : [""];
}
