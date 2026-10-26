import React, { useEffect, useMemo, useState } from "react";
import { createBillingService, billingService, monthlyPrice, SUBSCRIPTION_PLANS } from "../lib/subscriptions.js";
import { createAppBillingAdapter } from "../lib/stripeBilling.js";

function SubscriptionPlanCard({ plan, current, disabled, onChoose }) {
  return <article className="subscription-plan">
    <h4>{plan.name}</h4>
    <p>{plan.billingLabel}</p>
    {plan.testMode && <span className="subscription-badge">Stripe sandbox</span>}
    {current && <span className="subscription-badge">Current plan</span>}
    <p className="subscription-price">{plan.displayPrice || monthlyPrice(plan.price)}<span> / {plan.interval}</span></p>
    <button type="button" disabled={disabled || current} onClick={() => onChoose(plan.id)}>{current ? "Current plan" : `Choose ${plan.billingLabel}`}</button>
  </article>;
}

export default function SubscriptionSection({ user, offline, client, service: suppliedService, initiallyOpen = false }) {
  const configuredService = useMemo(() => client ? createBillingService(createAppBillingAdapter(client)) : billingService, [client]);
  const service = suppliedService || configuredService;
  const [open, setOpen] = useState(initiallyOpen);
  const [state, setState] = useState({ loading: true, record: null, plans: SUBSCRIPTION_PLANS, error: "" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ loading: true, record: null, plans: SUBSCRIPTION_PLANS, error: "" });
    setMessage("");
    Promise.all([service.getSubscription(user), service.getPlans(user)]).then(([record, plans]) => {
      if (live) setState({ loading: false, record, plans, error: "" });
    }).catch(() => { if (live) setState({ loading: false, record: null, plans: SUBSCRIPTION_PLANS, error: "Subscription status could not be loaded." }); });
    return () => { live = false; };
  }, [service, user, retry]);
  useEffect(() => {
    const refresh = () => { if (!document.hidden) setRetry((value) => value + 1); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  const record = state.record;
  const current = record && ["active", "trialing"].includes(record.subscriptionStatus);
  const plan = SUBSCRIPTION_PLANS.find((item) => item.id === record?.subscriptionPlan);
  async function action(planId) {
    setBusy(true); setMessage("");
    try {
      // The adapter owns checkout/portal navigation; clicks never grant access.
      if (planId) await service.checkout(user, planId);
      else await service.manageSubscription(user);
      setRetry((value) => value + 1);
    } catch (error) { setMessage(error.message || "Billing is unavailable. Please try again."); }
    finally { setBusy(false); }
  }
  return <section className="profile-card" aria-labelledby="subscription-heading">
    <div className="profile-card-heading"><h3 id="subscription-heading">Subscription</h3>
      <button type="button" aria-expanded={open} aria-controls="subscription-plans" onClick={() => setOpen((value) => !value)}>{open ? "Hide plans" : "Subscription"}</button>
    </div>
    <div aria-live="polite">
      {state.loading ? <p>Loading subscription…</p> : state.error ? <p role="alert">{state.error} <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button></p>
        : record ? <><p>Current plan: <strong>{plan?.name || record.subscriptionPlan || "Unknown plan"}</strong> <span className="subscription-badge">{record.subscriptionEnvironment === "sandbox" ? "Test · " : ""}{record.subscriptionStatus || "Unknown status"}</span></p>
          {Number.isFinite(record.subscriptionPrice) && <p>{monthlyPrice(record.subscriptionPrice)} / {record.subscriptionInterval || "month"}</p>}
          {record.subscriptionCurrentPeriodEnd && Number.isFinite(Date.parse(record.subscriptionCurrentPeriodEnd)) && <p>Current period ends {new Date(record.subscriptionCurrentPeriodEnd).toLocaleDateString()}</p>}
        </> : <p>Current plan: <strong>Free</strong> <span className="profile-muted">/ No active subscription</span></p>}
    </div>
    {current && service.canManage && <button type="button" disabled={busy || offline} onClick={() => action()}>Manage Subscription</button>}
    {service.canRestore && <button type="button" disabled={busy || offline} onClick={async () => {
      setBusy(true); setMessage("");
      try { await service.restorePurchases(user); setMessage("Purchases restored."); setRetry((value) => value + 1); }
      catch (error) { setMessage(error.message || "Purchases could not be restored."); }
      finally { setBusy(false); }
    }}>Restore Purchases</button>}
    <div id="subscription-plans" hidden={!open}>
      {(!service.configured || state.plans.every((plan) => plan.checkoutAvailable === false)) && <p className="profile-muted">Stripe sandbox checkout is not configured on the server yet.</p>}
      {state.plans.some((plan) => plan.testMode) && <p className="profile-muted">Test mode · Use Stripe test cards. No real payment will be collected.</p>}
      <div className="subscription-plans">{state.plans.map((item) => <SubscriptionPlanCard key={item.id} plan={item}
        current={!!current && item.id === record.subscriptionPlan} disabled={busy || offline || state.loading || !!state.error || item.checkoutAvailable === false} onChoose={action} />)}</div>
    </div>
    {message && <p role="status">{message}</p>}
  </section>;
}
