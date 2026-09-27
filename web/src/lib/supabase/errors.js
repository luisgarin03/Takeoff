export class CloudError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
export function cloudError(error) {
  if (error instanceof CloudError) return error;
  const message = String(error?.message || "");
  const messages = {
    OTK_AUTH: "Sign in again to continue. Your local work is safe.",
    OTK_ACCESS: "This project was deleted, access was removed, or it is not available to this account.",
    OTK_READ_ONLY: "You have viewer access. Save a copy to your own account to make cloud changes.",
    OTK_CONFLICT: "The cloud version changed since your last sync.",
    OTK_FORMAT: "This project data is damaged, too large, or needs a newer app version.",
    OTK_NAME: "Project names must be 200 characters or fewer.",
    OTK_MEMBER: "No confirmed account was found for that email address.",
    OTK_OWNER: "The project owner already has access.",
    OTK_FILES_REMAIN: "Some cloud files still need removal. Refresh the list and choose Finish deletion.",
    OTK_FILE_MISSING: "The file upload did not finish. Retry Save to Cloud; your local copy is unchanged.",
  };
  for (const [code, text] of Object.entries(messages)) if (message.includes(code)) return new CloudError(code, text);
  if (["PGRST205", "PGRST202"].includes(error?.code)) return new CloudError("OTK_SETUP", "Supabase database setup is incomplete. Apply the OpenTakeoff migration in docs/SUPABASE_SETUP.md.");
  if (error?.status === 401 || /JWT|refresh_token|session.*missing/i.test(message)) return new CloudError("OTK_AUTH", messages.OTK_AUTH);
  if (error?.status === 403 || /row.level|permission denied/i.test(message)) return new CloudError("OTK_ACCESS", messages.OTK_ACCESS);
  if (error?.status === 413 || /quota|exceed|too large/i.test(message)) return new CloudError("OTK_QUOTA", "Cloud storage or file limits were reached. Local files are unchanged.");
  if (error?.code === "invalid_credentials") return new CloudError("OTK_LOGIN", "Email or password is incorrect.");
  if (error?.code === "email_not_confirmed") return new CloudError("OTK_CONFIRM", "Confirm your email before signing in.");
  if (/rate|too many/i.test(message)) return new CloudError("OTK_RATE", "Too many requests. Please wait before trying again.");
  return new CloudError("OTK_NETWORK", "Cloud request failed. Check your connection and Supabase setup, then retry. Your local work is safe.");
}
export async function checked(request) {
  const { data, error } = await request;
  if (error) throw cloudError(error);
  return data;
}
