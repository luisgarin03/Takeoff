import { captureCloudProject, cloudFileReferences, FREE_FILE_LIMIT, restoreCloudProject, jsonHash, UUID } from "./projectState.js";
import { CloudError, cloudError } from "./errors.js";

// One sync coordinator per dialog. Local autosave never calls the network.
export function createCloudSync({ repository, files, local, meta, key, onProgress = () => {} }) {
  let running = false;
  const exclusive = async (fn) => {
    if (running) throw new CloudError("OTK_BUSY", "A cloud operation is already running.");
    running = true;
    try { return await fn(); } finally { running = false; }
  };
  return {
    metadata: () => meta.get(key),
    async status(payload) {
      const saved = await meta.get(key);
      if (!saved || saved.projectId !== payload.project_id) return "Local Only";
      const capture = await captureCloudProject(local, payload, saved.missingPlans || [], saved.archive || null);
      return capture.hash === saved.syncedHash ? (saved.pendingFiles ? "Files Local Only" : "Synced") : "Unsaved Changes";
    },
    save: (payload, options = {}) => exclusive(async () => {
      // Persist locally before any network operation. Failed cloud saves cannot
      // swallow work, and the original workspace survives Save As / conflicts.
      await local.saveAnnotations(payload);
      const old = await meta.get(key);
      const captured = await captureCloudProject(local, payload, old?.projectId === payload.project_id ? old.missingPlans || [] : [], old?.projectId === payload.project_id ? old.archive || null : null);
      const expected = options.expectedVersion ?? (old?.projectId === payload.project_id ? old.cloudVersion : 0);
      onProgress("Saving project state...");
      let project = await repository.saveProject(payload.project_id, expected, captured.state);
      const binding = { projectId: project.id, cloudVersion: project.version, cloudUpdatedAt: project.updated_at,
        localUpdatedAt: new Date().toISOString(), lastSyncedAt: new Date().toISOString(), syncedHash: captured.hash,
        missingPlans: captured.state.plans.filter((p) => !captured.files.has(p.sha256)), archive: captured.state.archive || null, pendingFiles: true };
      // Record the successful state commit before uploads: retries update this
      // version instead of creating a duplicate or confusing a partial save with a conflict.
      await meta.put(key, binding);
      // Only an explicit selection can change a new/unlocked project's provider.
      const requestedProvider = options.storageProvider || (expected === 0 ? options.newProjectProvider : undefined);
      if (requestedProvider && requestedProvider !== (project.file_provider || "supabase")) {
        project = await repository.setFileProvider(project.id, requestedProvider);
      }
      const provider = project.file_provider || "supabase";
      const warnings = [];
      const known = new Map((await repository.listFiles(project.id)).map((f) => [f.sha256, f]));
      for (const ref of cloudFileReferences(captured.state)) {
        if (options.signal?.aborted) throw cloudError(new Error("OTK_CANCELED"));
        if (known.get(ref.sha256)?.uploaded) continue;
        try {
          try {
            await repository.registerFile(project.id, ref);
          } catch (error) {
            // Older deployments reject the portable archive's new file kind as
            // OTK_FORMAT. Keep this separate from a damaged local .otk so the
            // user knows the server migration—not the project—needs updating.
            if (/\.otk$/i.test(ref.name) && error?.code === "OTK_FORMAT") {
              throw new CloudError("OTK_ARCHIVE_SETUP", "The cloud database does not yet support .otk project archives. Apply the latest OpenTakeoff Supabase migration, then retry Save to Cloud; your local project and files are unchanged.");
            }
            throw error;
          }
          if (ref.size > (files.limit?.(provider) ?? FREE_FILE_LIMIT)) { warnings.push(`${ref.name}: Local Only (${provider === "google_drive" ? "over 2 GiB" : "over 50 MB"}).`); continue; }
          const file = captured.files.get(ref.sha256);
          if (!file) { warnings.push(`${ref.name}: Local Only (not on this device).`); continue; }
          onProgress(`Uploading ${file.name}...`);
          await files.upload(`${project.id}/${ref.sha256}`, file, (n) => onProgress(`Uploading ${file.name} (${(file.size / 1048576).toFixed(1)} MB): ${Math.round(n * 100)}%`), { provider, signal: options.signal });
          if (options.signal?.aborted) throw cloudError(new Error("OTK_CANCELED"));
          if (provider !== "google_drive") await repository.finishFile(project.id, ref.sha256);
        } catch (error) {
          if (["OTK_AUTH", "OTK_ACCESS", "OTK_CANCELED"].includes(error.code)) throw error;
          warnings.push(`${ref.name}: ${provider === "google_drive" ? cloudError(error).message : "Local Only (upload incomplete; retry Save to Cloud)."}`);
        }
      }
      await meta.put(key, { ...binding, pendingFiles: warnings.length > 0 });
      return { project, warnings };
    }),
    load: (id, options = {}) => exclusive(async () => {
      onProgress("Downloading project...");
      const project = await repository.loadProject(id);
      const rows = new Map((await repository.listFiles(id)).map((f) => [f.sha256, f]));
      // Reuse bytes already in this workspace when hashes match. Never fetch a
      // public URL or trust a server-supplied storage path outside this project.
      const localPayload = await local.loadAnnotations();
      const localCapture = UUID.test(localPayload?.project_id) ? await captureCloudProject(local, localPayload) : { files: new Map() };
      const restored = await restoreCloudProject(project.project_state, async (ref) => {
        if (options.signal?.aborted) throw cloudError(new Error("OTK_CANCELED"));
        if (localCapture.files.has(ref.sha256)) return localCapture.files.get(ref.sha256).bytes;
        if (!rows.get(ref.sha256)?.uploaded) return null;
        onProgress(`Downloading ${ref.name}...`);
        return files.download(`${id}/${ref.sha256}`, { record: rows.get(ref.sha256), signal: options.signal,
          onProgress: (n) => onProgress(`Downloading ${ref.name}: ${Math.round(n * 100)}%`) });
      });
      const missingHashes = new Set(restored.missing.map((f) => f.sha256));
      if (options.signal?.aborted) throw cloudError(new Error("OTK_CANCELED"));
      return { project, restored, binding: { projectId: id, cloudVersion: project.version, cloudUpdatedAt: project.updated_at,
        lastSyncedAt: new Date().toISOString(), syncedHash: await jsonHash(project.project_state),
        pendingFiles: restored.missing.length > 0, missingPlans: project.project_state.plans.filter((p) => missingHashes.has(p.sha256)), archive: project.project_state.archive || null } };
    }),
  };
}
