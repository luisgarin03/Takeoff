import { checked, CloudError } from "./errors.js";
import { validateCloudState } from "./projectState.js";

export function createProjectRepository(client, userId) {
  const assertUser = async () => {
    const { data: { session } } = await client.auth.getSession();
    if (session?.user?.id !== userId) throw new CloudError("OTK_AUTH", "Your account changed. Reopen Cloud Projects before continuing.");
  };
  const rpc = async (name, args) => { await assertUser(); return checked(client.rpc(name, args)); };
  return {
    assertUser,
    async listProjects() {
      await assertUser();
      const projects = await checked(client.from("otk_projects").select("id,owner_id,name,version,created_at,updated_at,deleted_at").order("updated_at", { ascending: false }).limit(200));
      const members = await checked(client.from("otk_project_members").select("project_id,role").eq("user_id", userId));
      const profiles = await checked(client.from("otk_profiles").select("id,display_name"));
      return projects.map((p) => ({ ...p, role: p.owner_id === userId ? "owner" : members.find((m) => m.project_id === p.id)?.role,
        owner: profiles.find((profile) => profile.id === p.owner_id)?.display_name || p.owner_id.slice(0, 8) }));
    },
    async loadProject(id) {
      await assertUser();
      const p = await checked(client.from("otk_projects").select("*").eq("id", id).is("deleted_at", null).maybeSingle());
      if (!p) throw new CloudError("OTK_ACCESS", "Project unavailable: it may be deleted or no longer shared with you.");
      validateCloudState(p.project_state);
      return p;
    },
    async saveProject(id, expected, state) {
      validateCloudState(state);
      const result = await rpc("otk_save_project", { p_id: id, p_expected: expected, p_state: state });
      return Array.isArray(result) ? result[0] : result;
    },
    async renameProject(project, name) {
      const current = await this.loadProject(project.id);
      // Retain the version shown in the list; a newer cloud edit is a conflict.
      const state = { ...current.project_state, annotations: { ...current.project_state.annotations, project_name: name } };
      return this.saveProject(project.id, project.version, state);
    },
    async listFiles(id) {
      await assertUser();
      const files = [];
      // Storage manifests can exceed Supabase's default 1000-row response cap.
      for (let start = 0; ; start += 500) {
        const page = await checked(client.from("otk_project_files").select("*").eq("project_id", id).order("sha256").range(start, start + 499));
        files.push(...page); if (page.length < 500) return files;
      }
    },
    registerFile: (id, file) => rpc("otk_register_file", { p_id: id, p_hash: file.sha256, p_name: file.name, p_type: file.type, p_size: file.size }),
    async setFileProvider(id, provider) {
      const result = await rpc("otk_set_file_provider", { p_id: id, p_provider: provider });
      return Array.isArray(result) ? result[0] : result;
    },
    finishFile: (id, hash) => rpc("otk_finish_file", { p_id: id, p_hash: hash }),
    deleteProject: (id, version) => rpc("otk_delete_project", { p_id: id, p_expected: version }),
    purgeProject: (id) => rpc("otk_purge_project", { p_id: id }),
    shareProject: (id, email, role) => rpc("otk_share_project", { p_id: id, p_email: email, p_role: role }),
    removeProjectMember: (id, userId) => rpc("otk_remove_member", { p_id: id, p_user: userId }),
    async listProjectMembers(id) {
      await assertUser();
      const members = await checked(client.from("otk_project_members").select("*").eq("project_id", id));
      const profiles = await checked(client.from("otk_profiles").select("id,display_name"));
      return members.map((m) => ({ ...m, name: profiles.find((p) => p.id === m.user_id)?.display_name || m.user_id }));
    },
  };
}
