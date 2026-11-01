import test from 'node:test';
import assert from 'node:assert/strict';
import { activateLatestLogin } from '../src/lib/supabase/auth.js';

test('a fresh session revokes other logins before taking the editing lease', async () => {
  const calls: unknown[] = [];
  const client = {
    auth: { signOut: async (options: unknown) => { calls.push(options); return { error: null }; } },
    functions: { invoke: async (name: string, options: unknown) => { calls.push({ name, options }); return { error: null }; } },
  };
  const result = { session: { access_token: 'test' } };
  assert.equal(await activateLatestLogin(client, result), result);
  assert.deepEqual(calls, [{ scope: 'others' }, { name: 'otk-billing', options: { body: { action: 'session', take_over: true, device_name: 'Current login' } } }]);
});

test('signup without a session does not revoke any existing login', async () => {
  assert.deepEqual(await activateLatestLogin({}, { session: null }), { session: null });
});

test('failed revocation prevents takeover', async () => {
  let transferred = false;
  await assert.rejects(activateLatestLogin({
    auth: { signOut: async () => ({ error: new Error('offline') }) },
    functions: { invoke: async () => { transferred = true; } },
  }, { session: {} }));
  assert.equal(transferred, false);
});
