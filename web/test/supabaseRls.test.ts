import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Real PostgreSQL RLS/functions, with only Supabase's managed auth/storage
// tables replaced by a test harness. No live account or network is involved.
test("cloud migration enforces ownership, membership, CAS and private immutable files", async () => {
  const db = new PGlite();
  const owner = "10000000-0000-0000-0000-000000000001", editor = "10000000-0000-0000-0000-000000000002";
  const viewer = "10000000-0000-0000-0000-000000000003", outsider = "10000000-0000-0000-0000-000000000004";
  const id = "20000000-0000-0000-0000-000000000001", hash = "a".repeat(64), path = `${id}/${hash}`;
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema storage;
      create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth, public, storage to authenticated, anon;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
      alter table storage.objects enable row level security;
      grant select,insert,update,delete on storage.objects to authenticated;
    `);
    await db.exec(await readFile(new URL("../../supabase/migrations/202609270001_optional_cloud.sql", import.meta.url), "utf8"));
    for (const [user, name] of [[owner, "owner"], [editor, "editor"], [viewer, "viewer"], [outsider, "outsider"]]) {
      await db.query("insert into auth.users values($1,$2,now())", [user, `${name}@example.com`]);
    }
    const as = async (user: string) => { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]); await db.exec("set role authenticated"); };
    const state = { schema: "opentakeoff.cloud.v1", annotations: { schema: "opentakeoff.takeoff_canvas.v1", project_id: id, project_name: "Test", conditions: [], shapes: [] }, plans: [], snapshots: [] };
    const save = (version: number) => db.query<any>("select * from public.otk_save_project($1,$2,$3::jsonb)", [id, version, JSON.stringify(state)]);
    await as(owner);
    assert.equal((await save(0)).rows[0].version, 1);
    await assert.rejects(save(0), /OTK_CONFLICT/);
    await db.query("insert into otk_profiles(id,display_name) values($1,'Owner')", [owner]);
    for (const [email, role] of [["editor@example.com", "editor"], ["viewer@example.com", "viewer"]]) {
      await db.query("select otk_share_project($1,$2,$3)", [id, email, role]);
    }
    await db.query("select otk_register_file($1,$2,'test.pdf','application/pdf',100)", [id, hash]);
    await db.query("insert into storage.objects(bucket_id,name) values('otk-project-files',$1)", [path]);
    await db.query("select otk_finish_file($1,$2)", [id, hash]);
    await assert.rejects(db.query("update otk_projects set version=100 where id=$1", [id]), /permission denied/);
    await assert.rejects(db.query("select otk_purge_project($1)", [id]), /OTK_ACCESS/);
    await as(editor);
    assert.equal((await db.query("select * from otk_projects")).rows.length, 1);
    assert.equal((await db.query("select * from otk_profiles")).rows.length, 1);
    assert.equal((await save(1)).rows[0].version, 2);
    assert.equal((await db.query("select * from storage.objects")).rows.length, 1);
    assert.equal((await db.query("update storage.objects set name='bad' returning *")).rows.length, 0);
    await assert.rejects(db.query("select otk_share_project($1,'outsider@example.com','editor')", [id]), /OTK_ACCESS/);
    await assert.rejects(db.query("select otk_delete_project($1,2)", [id]), /OTK_ACCESS/);
    await as(viewer);
    assert.equal((await db.query("select * from otk_projects")).rows.length, 1);
    assert.equal((await db.query("select * from storage.objects")).rows.length, 1);
    await assert.rejects(save(2), /OTK_READ_ONLY/);
    await assert.rejects(db.query("select otk_register_file($1,$2,'b.pdf','application/pdf',1)", [id, "b".repeat(64)]), /OTK_ACCESS/);
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('otk-project-files',$1)", [`${id}/${"b".repeat(64)}`]), /row-level security/);
    await as(outsider);
    for (const table of ["otk_projects", "otk_project_members", "otk_project_files", "otk_profiles", "storage.objects"]) assert.equal((await db.query(`select * from ${table}`)).rows.length, 0);
    await assert.rejects(save(2), /OTK_ACCESS/);
    await assert.rejects(db.query("insert into otk_project_members values($1,$2,'editor',now())", [id, outsider]), /permission denied/);
    await as(owner);
    await assert.rejects(save(1), /OTK_CONFLICT/);
    await db.query("select otk_remove_member($1,$2)", [id, editor]);
    await as(editor);
    assert.equal((await db.query("select * from otk_projects")).rows.length, 0);
    await assert.rejects(save(2), /OTK_ACCESS/);
    await as(owner);
    await assert.rejects(db.query("select otk_delete_project($1,1)", [id]), /OTK_CONFLICT/);
    await db.query("select otk_delete_project($1,2)", [id]);
    await assert.rejects(db.query("select otk_purge_project($1)", [id]), /OTK_FILES_REMAIN/);
    await as(viewer);
    assert.equal((await db.query("select * from otk_projects")).rows.length, 0);
    assert.equal((await db.query("select * from storage.objects")).rows.length, 0);
    await as(owner);
    assert.equal((await db.query("delete from storage.objects returning *")).rows.length, 1);
    await db.query("select otk_purge_project($1)", [id]);
    assert.equal((await db.query("select * from otk_projects")).rows.length, 0);
    assert.equal((await db.query("select * from otk_project_files")).rows.length, 0);
    await db.exec("reset role; set role anon");
    await assert.rejects(save(0), /permission denied/);
  } finally { await db.close(); }
});
