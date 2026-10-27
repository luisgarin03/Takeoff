import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("Drive invitation inbox is private and cannot be forged or changed by clients", async () => {
  const db = new PGlite();
  const owner = "10000000-0000-0000-0000-000000000001", reader = "10000000-0000-0000-0000-000000000002", stranger = "10000000-0000-0000-0000-000000000003";
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to authenticated,anon,service_role;`);
    await db.exec(await readFile(new URL("../../supabase/migrations/202610030001_project_invitations.sql", import.meta.url), "utf8"));
    await db.query("insert into auth.users values($1,'owner@example.com',now()),($2,'reader@example.com',null),($3,'other@example.com',now())", [owner,reader,stranger]);
    const row = { id: "20000000-0000-0000-0000-000000000001", sender_id: owner, sender_email: "owner@example.com", recipient_email: "reader@example.com", project_name: "Project", files: [{ id: "drive-file", name: "project.otk" }] };
    const as = async (id: string) => { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); await db.exec("set role authenticated"); };
    await db.exec("set role service_role"); await db.query("select otk_reserve_invitation($1)", [JSON.stringify(row)]);
    await as(owner);
    assert.equal((await db.query("select * from otk_project_invitations")).rows.length, 1);
    await assert.rejects(db.query("select otk_reserve_invitation($1)", [JSON.stringify(row)]), /permission denied/);
    await assert.rejects(db.query("update otk_project_invitations set state='ready'"), /permission denied/);
    await as(reader); assert.equal((await db.query("select * from otk_project_invitations")).rows.length, 0);
    await db.exec("reset role; update otk_project_invitations set state='ready'");
    await as(reader); assert.equal((await db.query("select * from otk_project_invitations")).rows.length, 0);
    await db.exec("reset role"); await db.query("update auth.users set email_confirmed_at=now() where id=$1", [reader]);
    await as(reader); assert.equal((await db.query("select * from otk_project_invitations")).rows.length, 1);
    await as(stranger); assert.equal((await db.query("select * from otk_project_invitations")).rows.length, 0);
    await db.exec("reset role; update otk_project_invitations set expires_at=now()-interval '1 day'");
    await as(reader); assert.equal((await db.query("select * from otk_project_invitations")).rows.length, 0);
    await db.exec("reset role; set role anon"); await assert.rejects(db.query("select * from otk_project_invitations"), /permission denied/);
  } finally { await db.close(); }
});
