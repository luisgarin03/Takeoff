import { FREE_FILE_LIMIT } from "./projectState.js";
import { DRIVE_FILE_LIMIT } from "./driveFiles.js";

// Preserve the established Supabase provider; only dispatch at the binary boundary.
export function createProjectFiles(supabase, drive) {
  return {
    limit: (provider) => provider === "google_drive" ? DRIVE_FILE_LIMIT : FREE_FILE_LIMIT,
    upload: (path, file, progress, options = {}) => (options.provider === "google_drive" ? drive : supabase).upload(path, file, progress, options),
    download: (path, options = {}) => (options.record?.storage_provider === "google_drive" ? drive : supabase).download(path, options),
    async removeRecords(rows) {
      for (const row of rows.filter((r) => r.storage_provider === "google_drive")) await drive.remove(`${row.project_id}/${row.sha256}`);
      const paths = rows.filter((r) => r.storage_provider !== "google_drive").map((r) => r.storage_path);
      for (let i = 0; i < paths.length; i += 100) await supabase.remove(paths.slice(i, i + 100));
    },
  };
}
