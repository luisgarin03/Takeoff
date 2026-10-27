import test from 'node:test';
import assert from 'node:assert/strict';
import { trialEntitlement } from '../../supabase/functions/_shared/trial-entitlement.js';
import { hasActiveLicense, trialDaysRemaining, resolveLicenseAccess } from '../src/lib/license.js';
const start = Date.parse('2026-10-26T14:00:00Z');
const trial = { user_id: 'new-user', started_at: new Date(start).toISOString(), ends_at: new Date(start + 30 * 86400000).toISOString() };
test('signup trial lasts exactly 30 days, cannot be borrowed, and expires at the boundary', () => {
  assert.equal(trialEntitlement('new-user', trial, start)?.status, 'trialing');
  assert.equal(trialEntitlement('new-user', trial, start + 30 * 86400000)?.status, 'expired');
  assert.equal(trialEntitlement('new-user', trial, start - 1)?.status, 'expired');
  assert.equal(trialEntitlement('other-user', trial, start), null);
  assert.equal(trialEntitlement('new-user', { ...trial, ends_at: 'invalid' }, start), null);
  assert.equal(trialEntitlement('new-user', null, start), null);
});
test('trial countdown rounds up, never goes negative, and expired trial cannot edit even with a cached trialing status', () => {
  const record = { subscriptionProvider: 'trial', subscriptionStatus: 'trialing', subscriptionCurrentPeriodEnd: trial.ends_at };
  assert.equal(trialDaysRemaining(record, start), 30);
  assert.equal(trialDaysRemaining(record, start + 86400001), 29);
  assert.equal(trialDaysRemaining(record, start + 30 * 86400000 - 1), 1);
  assert.equal(trialDaysRemaining(record, start + 30 * 86400000), 0);
  assert.equal(trialDaysRemaining(record, start + 31 * 86400000), 0);
  assert.equal(trialDaysRemaining(null, start), null);
  assert.equal(hasActiveLicense(record, start), true);
  assert.equal(hasActiveLicense(record, start + 30 * 86400000), false);
});

test('an expired trial forces read-only even when the editing lease is still cached', () => {
  const result = resolveLicenseAccess({ record: { subscriptionProvider: 'trial', subscriptionStatus: 'trialing', subscriptionCurrentPeriodEnd: trial.ends_at }, session: { granted: true }, now: start + 30 * 86400000 });
  assert.equal(result.readOnly, true);
  assert.equal(result.reason, 'trial_expired');
});
