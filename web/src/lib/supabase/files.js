import { checked, cloudError, CloudError } from "./errors.js";
import { FREE_FILE_LIMIT } from "./projectState.js";

export const BUCKET = "otk-project-files";
// Provider contract: upload(path, file, progress), download(path), remove(paths).
// The project service owns references; another private provider can replace this.
export function createFileStorage(client, url, assertUser) {
  return {
    async upload(path, file, onProgress) {
      await assertUser();
      if (file.size > FREE_FILE_LIMIT) throw new CloudError("OTK_TOO_LARGE", "Local Only: file exceeds the 50 MB Free limit.");
      if (file.size <= 6 * 1024 * 1024) {
        const { error } = await client.storage.from(BUCKET).upload(path, file.bytes, { contentType: file.type, upsert: false });
        if (error && !/already exists|duplicate/i.test(error.message)) throw cloudError(error);
        return;
      }
      const { Upload } = await import("tus-js-client");
      const endpoint = new URL(url);
      if (endpoint.hostname.endsWith(".supabase.co")) endpoint.hostname = endpoint.hostname.replace(/\.supabase\.co$/, ".storage.supabase.co");
      endpoint.pathname = "/storage/v1/upload/resumable";
      const { data: { session } } = await client.auth.getSession();
      await new Promise((resolve, reject) => {
        const upload = new Upload(new Blob([file.bytes], { type: file.type }), {
          endpoint: endpoint.href, chunkSize: 6 * 1024 * 1024, retryDelays: [0, 1500, 3000],
          uploadDataDuringCreation: true, removeFingerprintOnSuccess: true,
          headers: { authorization: `Bearer ${session.access_token}` },
          metadata: { bucketName: BUCKET, objectName: path, contentType: file.type, cacheControl: "3600" },
          fingerprint: async () => `otk:${url}:${session.user.id}:${path}`,
          onBeforeRequest: async (request) => {
            await assertUser();
            const { data: { session: current } } = await client.auth.getSession();
            request.setHeader("authorization", `Bearer ${current.access_token}`);
          },
          onProgress: (sent, total) => onProgress?.(sent / total),
          onSuccess: resolve,
          onError: (error) => error.originalResponse?.getStatus() === 409 ? resolve() : reject(cloudError(error)),
        });
        upload.findPreviousUploads().then((previous) => {
          if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
          upload.start();
        }).catch(reject);
      });
    },
    async download(path) {
      await assertUser();
      const blob = await checked(client.storage.from(BUCKET).download(path));
      return new Uint8Array(await blob.arrayBuffer());
    },
    async remove(paths) {
      await assertUser();
      if (paths.length) await checked(client.storage.from(BUCKET).remove(paths));
    },
  };
}
