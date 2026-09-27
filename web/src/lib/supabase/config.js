function keyRole(key) {
  try { return JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role; }
  catch { return ""; }
}

export function assertPublicCloudEnv(env = {}) {
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith("VITE_SUPABASE_")) continue;
    const key = String(value || "").trim();
    if (key && (/SECRET|SERVICE_ROLE/.test(name) || key.startsWith("sb_secret_") || keyRole(key) === "service_role")) {
      throw new Error("Remove the Supabase secret/service-role key from VITE_* configuration. Only the public publishable key is allowed.");
    }
  }
}

export function cloudConfig(env = {}) {
  const url = String(env.VITE_SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = String(env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();
  if (!url && !key) return { configured: false };
  const role = keyRole(key);
  try { assertPublicCloudEnv(env); } catch (error) { return { configured: false, error: error.message }; }
  if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(url) || !(/^sb_publishable_[A-Za-z0-9_-]+$/.test(key) || role === "anon")) {
    return { configured: false, error: "Set a valid HTTPS Supabase URL and public publishable/anon key." };
  }
  return { configured: true, url, key };
}
