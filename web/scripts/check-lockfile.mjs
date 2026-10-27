import { readFileSync } from "node:fs";

// No dependencies: CI can run this before npm downloads any packages.
const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const errors = [];
if (lock.lockfileVersion !== 3 || !lock.packages) {
  errors.push("Expected a version 3 package-lock.json with package records");
}
for (const [name, entry] of Object.entries(lock.packages ?? {})) {
  if (!name) continue;
  let url;
  try { url = new URL(entry.resolved); } catch { /* Report below. */ }
  if (!url || url.origin !== "https://registry.npmjs.org" || url.username || url.password ||
      url.search || url.hash || !url.pathname.endsWith(".tgz")) {
    errors.push(`${name}: resolved must be an HTTPS npm registry tarball URL`);
  }
  const digest = entry.integrity?.slice(7);
  if (!/^sha512-[A-Za-z0-9+/]{86}==$/.test(entry.integrity ?? "") ||
      Buffer.from(digest, "base64").toString("base64") !== digest) {
    errors.push(`${name}: integrity must be a valid SHA-512 base64 digest`);
  }
}
if (errors.length) {
  console.error(`Invalid package-lock.json:\n${errors.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("Lockfile URLs and SHA-512 digest format are valid.");
}
