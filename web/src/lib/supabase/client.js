import { cloudConfig } from "./config.js";

export const configuration = cloudConfig(import.meta.env || {});
let pending;
export function getSupabase() {
  if (!configuration.configured) return Promise.resolve(null);
  pending ||= import("@supabase/supabase-js").then(({ createClient }) => createClient(configuration.url, configuration.key, {
    // OAuth codes are exchanged once by CloudProvider; email verification still uses codes.
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: "pkce" },
  }));
  return pending;
}
