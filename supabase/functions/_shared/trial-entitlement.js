// The trial row is created only by the auth.users signup trigger.
export function trialEntitlement(userId, trial, now = Date.now()) {
  if (!trial || trial.user_id !== userId) return null;
  const start = Date.parse(trial.started_at), end = Date.parse(trial.ends_at);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end - start !== 30 * 86400000) return null;
  return { user_id: userId, provider: 'trial', plan_id: 'estimating_pro_trial',
    status: now >= start && now < end ? 'trialing' : 'expired',
    current_period_end: trial.ends_at, environment: 'production', will_renew: false };
}
