// Only instantiated inside the Edge Function with its server-side admin client.
export function createDriveStore(db) {
  const read = async (q) => { const { data, error } = await q; if (error) throw new Error("OTK_DRIVE_DATABASE"); return data; };
  return {
    connection: (id) => read(db.from("otk_drive_connections").select("*").eq("user_id", id).maybeSingle()),
    putConnection: (row) => read(db.from("otk_drive_connections").upsert(row)),
    patchConnection: (id, patch) => read(db.from("otk_drive_connections").update({ ...patch, updated_at: new Date().toISOString() }).eq("user_id", id)),
    async startOAuth(row) {
      await read(db.from("otk_drive_connections").upsert({ user_id: row.user_id }, { onConflict: "user_id", ignoreDuplicates: true }));
      await read(db.from("otk_drive_connections").update({ oauth_nonce: row.state_hash }).eq("user_id", row.user_id));
      await read(db.from("otk_drive_oauth").delete().eq("user_id", row.user_id));
      await read(db.from("otk_drive_oauth").delete().lt("expires_at", new Date().toISOString()));
      await read(db.from("otk_drive_oauth").insert(row));
    },
    async claimOAuth(hash) { return (await read(db.rpc("otk_drive_claim_oauth", { p_hash: hash })))?.[0]; },
    async completeOAuth(pending, patch) {
      // A disconnected or superseded OAuth attempt cannot reconnect the account later.
      return !!(await read(db.from("otk_drive_connections").update({ ...patch, oauth_nonce: null })
        .eq("user_id", pending.user_id).eq("oauth_nonce", pending.state_hash).select("user_id"))).length;
    },
    cancelOAuth: (id) => read(db.from("otk_drive_oauth").delete().eq("user_id", id)),
    project: (id) => read(db.from("otk_projects").select("id,owner_id,file_provider,deleted_at").eq("id", id).maybeSingle()),
    member: (id, user) => read(db.from("otk_project_members").select("role").eq("project_id", id).eq("user_id", user).maybeSingle()),
    file: (id, hash) => read(db.from("otk_project_files").select("*").eq("project_id", id).eq("sha256", hash).maybeSingle()),
    patchFile: (id, hash, patch) => read(db.from("otk_project_files").update(patch).eq("project_id", id).eq("sha256", hash)),
    lease: (id, hash, lease) => read(db.rpc("otk_drive_lease", { p_id: id, p_hash: hash, p_lease: lease })),
    release: (id, hash, lease) => read(db.from("otk_drive_uploads").update({ lease_id: null, lease_until: null }).eq("project_id", id).eq("sha256", hash).eq("lease_id", lease)),
    upload: (id, hash) => read(db.from("otk_drive_uploads").select("session_cipher").eq("project_id", id).eq("sha256", hash).maybeSingle()),
    patchUpload: (id, hash, session_cipher) => read(db.from("otk_drive_uploads").update({ session_cipher }).eq("project_id", id).eq("sha256", hash)),
  };
}
