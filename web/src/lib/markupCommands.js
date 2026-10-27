// Pure markup mutations used by the Takeoff canvas undo/redo history.
// Commands replace whole markup records so undo restores absent optional fields
// (for example a newly added text-note `target`) exactly, not as `undefined` keys.

export function applyMarkupCommand(markups, cmd) {
  const current = Array.isArray(markups) ? markups : [];
  if (!cmd || typeof cmd !== "object") return { markups: current, inverse: null };

  if (cmd.type === "add" && cmd.markup?.id) {
    if (current.some((markup) => markup.id === cmd.markup.id)) return { markups: current, inverse: null };
    const index = Number.isInteger(cmd.index) ? Math.max(0, Math.min(current.length, cmd.index)) : current.length;
    const next = [...current];
    next.splice(index, 0, cmd.markup);
    return { markups: next, inverse: { type: "delete", ids: [cmd.markup.id] } };
  }

  if (cmd.type === "delete" && Array.isArray(cmd.ids)) {
    const wanted = new Set(cmd.ids);
    const removed = current.flatMap((markup, index) => wanted.has(markup.id) ? [{ markup, index }] : []);
    if (!removed.length) return { markups: current, inverse: null };
    return {
      markups: current.filter((markup) => !wanted.has(markup.id)),
      inverse: { type: "restore", items: removed },
    };
  }

  if (cmd.type === "restore" && Array.isArray(cmd.items)) {
    const existing = new Set(current.map((markup) => markup.id));
    const items = cmd.items.filter((item) => item?.markup?.id && !existing.has(item.markup.id));
    if (!items.length) return { markups: current, inverse: null };
    const next = [...current];
    for (const item of items.slice().sort((a, b) => a.index - b.index)) {
      next.splice(Math.max(0, Math.min(next.length, item.index)), 0, item.markup);
    }
    return { markups: next, inverse: { type: "delete", ids: items.map((item) => item.markup.id) } };
  }

  if (cmd.type === "replace" && cmd.markup?.id) {
    const index = current.findIndex((markup) => markup.id === cmd.markup.id);
    if (index < 0 || current[index] === cmd.markup) return { markups: current, inverse: null };
    const previous = current[index];
    const next = [...current];
    next[index] = cmd.markup;
    return { markups: next, inverse: { type: "replace", markup: previous } };
  }

  return { markups: current, inverse: null };
}
