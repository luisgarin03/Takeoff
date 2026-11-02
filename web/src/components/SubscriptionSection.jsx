import React, { useEffect, useMemo, useState } from "react";
import { createBillingService, billingService, monthlyPrice, SUBSCRIPTION_PLANS } from "../lib/subscriptions.js";
import { createAppBillingAdapter } from "../lib/stripeBilling.js";
import { useLicenseAccess } from "../lib/licenseAccess.jsx";
import TrialCountdown from "./TrialCountdown.jsx";
import StartTrialButton from "./StartTrialButton.jsx";
import "../styles/subscriptionPass.css";

const PASS_FEATURES = ["PDF plans and sheet navigation", "Length, area, and count takeoffs", "Drawing markups and annotations", "Material calculations and estimates", "Cloud projects"];

function SubscriptionPlanCard({ plan, current, disabled, onChoose }) {
  const yearly = plan.interval === "year";
  return <article className="subscription-plan subscription-pass">
    <div className="pass-eyebrow"><span>ESTIMATING</span><span>{yearly ? "Best value" : "Flexible access"}</span></div>
    <div className="pass-word" aria-hidden="true">PASS</div>
    <div className="pass-perforation" aria-hidden="true"><span>✂</span></div>
    <h4>{yearly ? "Pass for a year" : "Pass for 30 days"}</h4>
    <p className="pass-description">{yearly ? "A full year of ESTIMATING." : "A flexible pass for your estimating work."}</p>
    <div className="pass-badges">{plan.testMode && <span className="subscription-badge">Stripe sandbox</span>}{current && <span className="subscription-badge">Current plan</span>}</div>
    <div className="pass-pricing"><p className="subscription-price">{plan.displayPrice || monthlyPrice(plan.price)}</p><span>{yearly ? "Yearly subscription" : "Monthly subscription"}</span></div>
    <ul className="pass-features">{PASS_FEATURES.map((feature) => <li key={feature}><span aria-hidden="true">✓</span>{feature}</li>)}</ul>
    <button type="button" aria-label={current ? `Current ${plan.billingLabel} plan` : `Choose ${plan.billingLabel} pass`} disabled={disabled || current} onClick={() => onChoose(plan.id)}><span>{current ? "Current plan" : "Choose this pass"}</span><span aria-hidden="true">↗</span></button>
    <p className="pass-terms">{plan.displayPrice || monthlyPrice(plan.price)} billed {yearly ? "yearly" : "monthly"} · Subscription terms shown at checkout.</p>
    <footer className="pass-footer"><div><small>Access pass</small><strong>{yearly ? "01Y" : "30D"}</strong></div><div className="pass-barcode" aria-hidden="true" /></footer>
  </article>;
}
export default function SubscriptionSection({ user, offline, client, service: suppliedService, onOpenWorkspace }) {
  const license = useLicenseAccess();
  const configuredService = useMemo(() => client ? createBillingService(createAppBillingAdapter(client)) : billingService, [client]);
  const service = suppliedService || configuredService;
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
  // Show the billing subscription even when editing uses a trial.
  const record = state.record || license.subscription;
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
    <StartTrialButton />
    <div className="profile-card-heading"><h3 id="subscription-heading">Subscription</h3>
    </div>
    <div aria-live="polite">
      {state.loading ? <p>Loading subscription…</p> : state.error ? <p role="alert">{state.error} <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button></p>
        : record ? <><p>Current plan: <strong>{record.subscriptionProvider === 'trial' ? '30-day free trial' : plan?.name || record.subscriptionPlan || "Unknown plan"}</strong> {record.subscriptionProvider !== "trial" && <span className="subscription-badge">{record.subscriptionEnvironment === "sandbox" ? "Test · " : ""}{record.subscriptionStatus || "Unknown status"}</span>}</p>
          {record.subscriptionProvider === 'trial' && <p><TrialCountdown subscription={record} /></p>}
          {Number.isFinite(record.subscriptionPrice) && <p>{monthlyPrice(record.subscriptionPrice)} / {record.subscriptionInterval || "month"}</p>}
          {record.subscriptionCurrentPeriodEnd && Number.isFinite(Date.parse(record.subscriptionCurrentPeriodEnd)) && <p>Current period ends {new Date(record.subscriptionCurrentPeriodEnd).toLocaleDateString()}</p>}
        </> : <p>Current plan: <strong>Free</strong> <span className="profile-muted">/ No active subscription</span></p>}
    </div>
    {current && onOpenWorkspace && <button type="button" className="btn-primary" onClick={onOpenWorkspace}>Open full workspace</button>}
    {current && record.subscriptionProvider !== 'trial' && service.canManage && <button type="button" disabled={busy || offline} onClick={() => action()}>Manage Subscription</button>}
    {service.canRestore && <button type="button" disabled={busy || offline} onClick={async () => {
      setBusy(true); setMessage("");
      try { await service.restorePurchases(user); setMessage("Purchases restored."); setRetry((value) => value + 1); }
      catch (error) { setMessage(error.message || "Purchases could not be restored."); }
      finally { setBusy(false); }
    }}>Restore Purchases</button>}
    <div id="subscription-plans">
      {(!service.configured || state.plans.every((plan) => plan.checkoutAvailable === false)) && <p className="profile-muted">Stripe sandbox checkout is not configured on the server yet.</p>}
      {state.plans.some((plan) => plan.testMode) && <p className="profile-muted">Test mode · Use Stripe test cards. No real payment will be collected.</p>}
      <div className="subscription-plans">{state.plans.map((item) => <SubscriptionPlanCard key={item.id} plan={item}
        current={!!current && item.id === record.subscriptionPlan} disabled={busy || offline || state.loading || !!state.error || item.checkoutAvailable === false} onChoose={action} />)}</div>
    </div>
    {message && <p role="status">{message}</p>}
  </section>;
}
