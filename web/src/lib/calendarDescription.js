// Google descriptions may be HTML. Parse into an inert document and expose text,
// retaining paragraph boundaries, list items, and link destinations for editing.
export function calendarDescriptionText(value) {
  const source = String(value || "");
  if (!/<\/?[a-z][\s\S]*?>/i.test(source)) return source;
  const doc = new DOMParser().parseFromString(source, "text/html");
  doc.querySelectorAll("script,style,iframe,object,template").forEach((node) => node.remove());
  doc.querySelectorAll("a[href]").forEach((node) => {
    const href = node.getAttribute("href") || "";
    if (/^(https?:\/\/|mailto:)/i.test(href) && !node.textContent.includes(href.replace(/^mailto:/i, ""))) node.append(` (${href.replace(/^mailto:/i, "")})`);
  });
  doc.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
  doc.querySelectorAll("p,div,li,h1,h2,h3,h4,h5,h6,blockquote,tr").forEach((node) => {
    node.prepend(node.tagName === "LI" ? "\n• " : "\n");
    node.append("\n");
  });
  return (doc.body.textContent || "").replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
