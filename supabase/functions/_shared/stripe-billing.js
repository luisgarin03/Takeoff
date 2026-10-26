export const STRIPE_PLANS = Object.freeze({
 estimating_pro_monthly: { amount: 4000, interval: 'month' },
 estimating_pro_yearly: { amount: 40000, interval: 'year' },
});
export class BillingError extends Error {
 constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
export function stripeReturn(value, origins) {
 let url; try { url = new URL(value); } catch { throw new BillingError('OTK_BILLING_RETURN'); }
 if (!origins.includes(url.origin) || url.username || url.password || value.length > 2048) throw new BillingError('OTK_BILLING_RETURN');
 url.searchParams.delete('stripe_session'); url.searchParams.delete('stripe_checkout'); url.hash = '';
 return url;
}
export function stripeRecord(userId, subscription, customer) {
 const item = subscription.items?.data?.[0], price = item?.price;
 const plan = Object.entries(STRIPE_PLANS).find(([, p]) => price?.currency === 'usd' && price.unit_amount === p.amount && price.recurring?.interval === p.interval && (price.recurring.interval_count || 1) === 1);
 if (subscription.livemode !== false || !plan || subscription.metadata?.otk_user_id !== userId || subscription.customer !== customer || subscription.metadata?.otk_plan_id !== plan[0]) throw new BillingError('OTK_BILLING_OWNERSHIP', 403);
 const end = item?.current_period_end || subscription.current_period_end;
 const status = subscription.status === 'trialing' ? 'trialing' : subscription.status === 'active' ? (subscription.cancel_at_period_end ? 'canceled' : 'active') : subscription.status === 'past_due' ? 'billing_issue' : subscription.status === 'canceled' ? 'expired' : 'inactive';
 if (!Number.isFinite(end)) throw new BillingError('OTK_BILLING_PERIOD', 502);
 return { user_id: userId, provider: 'stripe', plan_id: plan[0], status, product_id: price.id || '', store: 'stripe', entitlement_id: 'estimating_pro', revenuecat_customer_id: customer, subscription_id: subscription.id, current_period_end: new Date(end * 1000).toISOString(), will_renew: ['active','trialing'].includes(subscription.status) && !subscription.cancel_at_period_end, environment: 'sandbox', updated_at: new Date().toISOString() };
}
export function createStripeBilling({ stripe, store, origins, namespace }) {
 async function customer(user) {
  const saved = await store.customer(user.id);
  if (saved) return saved.customer_id;
  const created = await stripe.customers.create({ email: user.email, metadata: { otk_user_id: user.id } }, { idempotencyKey: `${namespace}:customer:${user.id}` });
  await store.saveCustomer(user.id, created.id); return created.id;
 }
 async function refresh(userId, customerId) {
  const existing = await store.subscription(userId);
  // Sandbox testing must never replace a real paid entitlement.
  if (existing?.environment === 'production') throw new BillingError('OTK_BILLING_LIVE_ACCOUNT', 409);
  const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
  const candidates = subscriptions.data.filter((s) => s.metadata?.otk_user_id === userId && s.metadata?.otk_plan_id in STRIPE_PLANS);
  const rank = (s) => ['active','trialing','past_due'].includes(s.status) ? 1 : 0;
  candidates.sort((a,b) => rank(b)-rank(a) || b.created-a.created);
  if (!candidates.length) return existing || null;
  const row = stripeRecord(userId,candidates[0],customerId);
  await store.saveSubscription(row); return row;
 }
 return {
  async checkout(user, planId, returnUrl) {
   const plan = STRIPE_PLANS[planId]; if (!plan) throw new BillingError('OTK_BILLING_PLAN');
   const destination = stripeReturn(returnUrl,origins);
   const customerId = await customer(user);
   const current = await refresh(user.id,customerId);
   if (current && ['active','trialing','canceled','billing_issue'].includes(current.status) && Date.parse(current.current_period_end) > Date.now()) throw new BillingError('OTK_BILLING_ALREADY_ACTIVE',409);
   const success = new URL(destination), cancel = new URL(destination);
   success.searchParams.set('stripe_checkout','success'); cancel.searchParams.set('stripe_checkout','canceled');
   const session = await stripe.checkout.sessions.create({ mode: 'subscription', customer: customerId, client_reference_id: user.id,
    success_url: `${success.href}&stripe_session={CHECKOUT_SESSION_ID}`, cancel_url: cancel.href,
    line_items: [{ price_data: { currency: 'usd', unit_amount: plan.amount, recurring: { interval: plan.interval }, product_data: { name: 'Estimating Pro' } }, quantity: 1 }],
    subscription_data: { metadata: { otk_user_id: user.id, otk_plan_id: planId } }, metadata: { otk_user_id: user.id, otk_plan_id: planId },
   }, { idempotencyKey: `${namespace}:checkout:v2:${user.id}:${planId}:${Math.floor(Date.now()/300000)}` });
   if (session.livemode !== false || !session.url?.startsWith('https://checkout.stripe.com/')) throw new BillingError('OTK_BILLING_TEST_ONLY',503);
   return { url: session.url, testMode: true };
  },
  async refresh(user) { const saved = await store.customer(user.id); return saved ? refresh(user.id,saved.customer_id) : store.subscription(user.id); },
  async portal(user,returnUrl) {
   const destination = stripeReturn(returnUrl,origins), saved = await store.customer(user.id);
   if (!saved) throw new BillingError('OTK_BILLING_CUSTOMER',404);
   const result = await stripe.billingPortal.sessions.create({ customer: saved.customer_id, return_url: destination.href });
   return { url: result.url, testMode: true };
  },
  async webhook(event) {
   if (event.livemode !== false) throw new BillingError('OTK_BILLING_TEST_ONLY',400);
   if (!['checkout.session.completed','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed'].includes(event.type)) return;
   const object = event.data.object, customerId = typeof object.customer === 'string' ? object.customer : object.customer?.id;
   const saved = customerId ? await store.userForCustomer(customerId) : null;
   if (!saved) return;
   await refresh(saved.user_id,customerId);
   await store.saveEvent({ id: event.id, user_id: saved.user_id, event_type: event.type, environment: 'sandbox' });
  },
 };
}
