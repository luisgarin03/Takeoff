import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('explicit transfer replaces the lease and old session cannot renew it', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      insert into auth.users values ('11111111-1111-4111-8111-111111111111');`);
    for (const name of ['202610210002_license_sessions.sql', '202610310002_transfer_license_session.sql']) {
      await db.exec(readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8'));
    }
    const user = '11111111-1111-4111-8111-111111111111';
    const old = '22222222-2222-4222-8222-222222222222';
    const current = '33333333-3333-4333-8333-333333333333';
    const claim = (device: string) => db.query<{ granted: boolean }>('select * from otk_claim_license_session($1,$2,$3,120)', [user, device, 'Windows']);
    assert.equal((await claim(old)).rows[0].granted, true);
    assert.equal((await claim(current)).rows[0].granted, false);
    const moved = await db.query<{ granted: boolean }>('select * from otk_transfer_license_session($1,$2,$3,120)', [user, current, 'Windows']);
    assert.equal(moved.rows[0].granted, true);
    assert.equal((await claim(old)).rows[0].granted, false);
    assert.equal((await claim(current)).rows[0].granted, true);
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select * from otk_transfer_license_session($1,$2,$3,120)', [user, old, 'Windows']), /permission denied/);
  } finally { await db.close(); }
});
