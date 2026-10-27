export function accountProfile(user, savedName = "") {
  const meta = user?.user_metadata || {};
  const clean = (value) => typeof value === "string" ? value.trim() : "";
  const name = clean(savedName) || clean(meta.display_name) || clean(meta.full_name) || clean(meta.name) || clean(user?.email) || "Account";
  let avatar = "";
  for (const value of [meta.avatar_url, meta.picture]) {
    try { const url = new URL(value); if (url.protocol === "https:") { avatar = url.href; break; } } catch { /* Fall back to initials. */ }
  }
  return { name, email: clean(user?.email), avatar, initials: name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() };
}
