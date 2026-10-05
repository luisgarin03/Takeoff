import React, { useEffect, useState } from "react";
import { billingService, monthlyPrice, SUBSCRIPTION_PLANS } from "../lib/subscriptions.js";

function SubscriptionPlanCard({ plan, current, disabled, onChoose }) {
  return <article className="subscription-plan">
    <h4>{plan.name}</h4>
    {current && <span className="subscription-badge">Current plan</span>}
    <p className="subscription-price">{monthlyPrice(plan.price)}<span> / {plan.interval}</span></p>
    <button type="button" disabled={disabled || current} onClick={() => onChoose(plan.id)}>{current ? "Current plan" : `Choose ${plan.name}`}</button>
  </article>;
}

export default function SubscriptionSection({ user, offline, service = billingService }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ loading: true, record: null, error: "" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ loading: true, record: null, error: "" });
    setMessage("");
    service.getSubscription(user).then((record) => {
      if (live) setState({ loading: false, record, error: "" });
    }).catch(() => { if (live) setState({ loading: false, record: null, error: "Subscription status could not be loaded." }); });
    return () => { live = false; };
  }, [service, user, retry]);
  const record = state.record;
  const current = record && ["active", "trialing"].includes(record.subscriptionStatus);
  const plan = SUBSCRIPTION_PLANS.find((item) => item.id === record?.subscriptionPlan);
  async function action(planId) {
    setBusy(true); setMessage("");
    try {
      // The adapter owns checkout/portal navigation; clicks never grant access.
      if (planId) await service.checkout(user, planId);
      else await service.manageSubscription(user);
    } catch (error) { setMessage(error.message || "Billing is unavailable. Please try again."); }
    finally { setBusy(false); }
  }
  return <section className="profile-card" aria-labelledby="subscription-heading">
    <div className="profile-card-heading"><h3 id="subscription-heading">Subscription</h3>
      <button type="button" aria-expanded={open} aria-controls="subscription-plans" onClick={() => setOpen((value) => !value)}>{open ? "Hide plans" : "Subscription"}</button>
    </div>
    <div aria-live="polite">
      {state.loading ? <p>Loading subscription…</p> : state.error ? <p role="alert">{state.error} <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button></p>
        : record ? <><p>Current plan: <strong>{plan?.name || record.subscriptionPlan || "Unknown plan"}</strong> <span className="subscription-badge">{record.subscriptionStatus || "Unknown status"}</span></p>
          {Number.isFinite(record.subscriptionPrice) && <p>{monthlyPrice(record.subscriptionPrice)} / {record.subscriptionInterval || "month"}</p>}
          {record.subscriptionCurrentPeriodEnd && Number.isFinite(Date.parse(record.subscriptionCurrentPeriodEnd)) && <p>Current period ends {new Date(record.subscriptionCurrentPeriodEnd).toLocaleDateString()}</p>}
        </> : <p>Current plan: <strong>Free</strong> <span className="profile-muted">/ No active subscription</span></p>}
    </div>
    {current && service.canManage && <button type="button" disabled={busy || offline} onClick={() => action()}>Manage Subscription</button>}
    <div id="subscription-plans" hidden={!open}>
      {!service.configured && <p className="profile-muted">Paid plans are not available for purchase yet. Checkout requires a connected billing backend and payment provider.</p>}
      <div className="subscription-plans">{SUBSCRIPTION_PLANS.map((item) => <SubscriptionPlanCard key={item.id} plan={item}
        current={!!current && item.id === record.subscriptionPlan} disabled={busy || offline || state.loading || !!state.error} onChoose={action} />)}</div>
    </div>
    {message && <p role="status">{message}</p>}
  </section>;
}
