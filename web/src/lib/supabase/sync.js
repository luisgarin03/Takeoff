import { captureCloudProject, cloudFileReferences, FREE_FILE_LIMIT, restoreCloudProject, jsonHash, UUID } from "./projectState.js";
import { CloudError } from "./errors.js";

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
      const capture = await captureCloudProject(local, payload, saved.missingPlans || []);
      return capture.hash === saved.syncedHash ? (saved.pendingFiles ? "Files Local Only" : "Synced") : "Unsaved Changes";
    },
    save: (payload, options = {}) => exclusive(async () => {
      // Persist locally before any network operation. Failed cloud saves cannot
      // swallow work, and the original workspace survives Save As / conflicts.
      await local.saveAnnotations(payload);
      const old = await meta.get(key);
      const captured = await captureCloudProject(local, payload, old?.projectId === payload.project_id ? old.missingPlans || [] : []);
      const expected = options.expectedVersion ?? (old?.projectId === payload.project_id ? old.cloudVersion : 0);
      onProgress("Saving project state...");
      const project = await repository.saveProject(payload.project_id, expected, captured.state);
      const binding = { projectId: project.id, cloudVersion: project.version, cloudUpdatedAt: project.updated_at,
        localUpdatedAt: new Date().toISOString(), lastSyncedAt: new Date().toISOString(), syncedHash: captured.hash,
        missingPlans: captured.state.plans.filter((p) => !captured.files.has(p.sha256)), pendingFiles: true };
      // Record the successful state commit before uploads: retries update this
      // version instead of creating a duplicate or confusing a partial save with a conflict.
      await meta.put(key, binding);
      const warnings = [];
      const known = new Map((await repository.listFiles(project.id)).map((f) => [f.sha256, f]));
      for (const ref of cloudFileReferences(captured.state)) {
        if (known.get(ref.sha256)?.uploaded) continue;
        try {
          await repository.registerFile(project.id, ref);
          if (ref.size > FREE_FILE_LIMIT) { warnings.push(`${ref.name}: Local Only (over 50 MB).`); continue; }
          const file = captured.files.get(ref.sha256);
          if (!file) { warnings.push(`${ref.name}: Local Only (not on this device).`); continue; }
          onProgress(`Uploading ${file.name}...`);
          await files.upload(`${project.id}/${ref.sha256}`, file, (n) => onProgress(`Uploading ${file.name}: ${Math.round(n * 100)}%`));
          await repository.finishFile(project.id, ref.sha256);
        } catch (error) {
          if (error.code === "OTK_AUTH" || error.code === "OTK_ACCESS") throw error;
          warnings.push(`${ref.name}: Local Only (upload incomplete; retry Save to Cloud).`);
        }
      }
      await meta.put(key, { ...binding, pendingFiles: warnings.length > 0 });
      return { project, warnings };
    }),
    load: (id) => exclusive(async () => {
      onProgress("Downloading project...");
      const project = await repository.loadProject(id);
      const rows = new Map((await repository.listFiles(id)).map((f) => [f.sha256, f]));
      // Reuse bytes already in this workspace when hashes match. Never fetch a
      // public URL or trust a server-supplied storage path outside this project.
      const localPayload = await local.loadAnnotations();
      const localCapture = UUID.test(localPayload?.project_id) ? await captureCloudProject(local, localPayload) : { files: new Map() };
      const restored = await restoreCloudProject(project.project_state, async (ref) => {
        if (localCapture.files.has(ref.sha256)) return localCapture.files.get(ref.sha256).bytes;
        if (!rows.get(ref.sha256)?.uploaded) return null;
        onProgress(`Downloading ${ref.name}...`);
        return files.download(`${id}/${ref.sha256}`);
      });
      const missingHashes = new Set(restored.missing.map((f) => f.sha256));
      return { project, restored, binding: { projectId: id, cloudVersion: project.version, cloudUpdatedAt: project.updated_at,
        lastSyncedAt: new Date().toISOString(), syncedHash: await jsonHash(project.project_state),
        pendingFiles: restored.missing.length > 0, missingPlans: project.project_state.plans.filter((p) => missingHashes.has(p.sha256)) } };
    }),
  };
}
