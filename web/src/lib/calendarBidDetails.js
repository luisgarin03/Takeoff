export const BID_FIELDS = { project: "Project", client: "Client / GC", contact: "Bid contact", due: "Bid due date and time", amount: "Bid amount", documents: "Project documents", invitation: "Original invitation", folder: "Bid link / folder", location: "Location", notes: "Meeting notes" };
export function normalizeBidDetails(value = {}) {
  return Object.fromEntries(Object.keys(BID_FIELDS).map((key) => [key, typeof value?.[key] === "string" ? value[key].slice(0, 10000) : ""]));
}
export function parseBidDetails(description = "") {
  const result = {};
  const labels = Object.values(BID_FIELDS);
  for (const [key, label] of Object.entries(BID_FIELDS)) {
    const start = description.indexOf(`${label}: `);
    if (start < 0) continue;
    const rest = description.slice(start + label.length + 2);
    const ends = labels.map((next) => rest.indexOf(`\n\n${next}: `)).filter((index) => index >= 0);
    result[key] = rest.slice(0, ends.length ? Math.min(...ends) : rest.length).trim();
  }
  return normalizeBidDetails(result);
}
export function bidDescription(details) {
  return Object.entries(BID_FIELDS).filter(([key]) => details[key]).map(([key, label]) => `${label}: ${details[key]}`).join("\n\n");
}
