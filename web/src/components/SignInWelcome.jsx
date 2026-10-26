import React, { useEffect, useMemo, useState } from "react";
import { createBillingService } from "../lib/subscriptions.js";
import { createAppBillingAdapter } from "../lib/stripeBilling.js";
import { hasActiveLicense, sandboxLicensesAllowed } from "../lib/license.js";
import SubscriptionSection from "./SubscriptionSection.jsx";

export default function SignInWelcome({ cloud, onClose }) {
  const service = useMemo(() => createBillingService(createAppBillingAdapter(cloud.client)), [cloud.client]);
  const [status, setStatus] = useState("loading");
  const [showPlans, setShowPlans] = useState(false);
  useEffect(() => {
    let live = true;
    const check = () => service.getSubscription(cloud.user).then((record) => {
      if (live) setStatus(hasActiveLicense(record, Date.now(), sandboxLicensesAllowed()) ? "premium" : hasActiveLicense(record, Date.now(), true) && record.subscriptionEnvironment === "sandbox" ? "sandbox" : "free");
    }).catch(() => { if (live) setStatus("error"); });
    check();
    window.addEventListener("focus", check);
    return () => { live = false; window.removeEventListener("focus", check); };
  }, [service, cloud.user]);
  return <section className="profile-card" aria-labelledby="signin-welcome-heading">
    <h3 id="signin-welcome-heading">{status === "loading" ? "Welcome" : ["premium", "sandbox"].includes(status) ? "Welcome back" : status === "error" ? "You're signed in" : "You are in view-only mode"}</h3>
    <p>{status === "loading" ? "Checking your subscription…" : status === "premium" ? "Your Estimating Pro subscription is active." : status === "sandbox" ? "Your Estimating Pro test subscription is active. Sandbox purchases enable local development testing; production access requires a live subscription." : status === "error" ? "We couldn't check your subscription. Open subscription options to try again." : "Get Estimating Pro to unlock all tools."}</p>
    <div className="cloud-actions">
      {!["premium", "sandbox"].includes(status) && <button type="button" className="btn-primary" disabled={status === "loading"} onClick={() => setShowPlans(true)}>{status === "error" ? "Subscription options" : "Get Estimating Pro"}</button>}
      <button type="button" onClick={onClose}>{status === "free" ? "Continue in view-only mode" : "Continue"}</button>
    </div>
    {showPlans && <SubscriptionSection user={cloud.user} client={cloud.client} offline={cloud.offline} initiallyOpen />}
  </section>;
}
