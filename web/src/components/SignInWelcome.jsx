import React, { useEffect, useMemo, useState } from "react";
import { createBillingService } from "../lib/subscriptions.js";
import { createRevenueCatBillingAdapter } from "../lib/revenueCatBilling.js";
import { hasActiveLicense, sandboxLicensesAllowed } from "../lib/license.js";
import SubscriptionSection from "./SubscriptionSection.jsx";

export default function SignInWelcome({ cloud, onClose }) {
  const service = useMemo(() => createBillingService(createRevenueCatBillingAdapter(cloud.client)), [cloud.client]);
  const [status, setStatus] = useState("loading");
  const [showPlans, setShowPlans] = useState(false);
  useEffect(() => {
    let live = true;
    const check = () => service.getSubscription(cloud.user).then((record) => {
      if (live) setStatus(hasActiveLicense(record, Date.now(), sandboxLicensesAllowed()) ? "premium" : "free");
    }).catch(() => { if (live) setStatus("error"); });
    check();
    window.addEventListener("focus", check);
    return () => { live = false; window.removeEventListener("focus", check); };
  }, [service, cloud.user]);
  return <section className="profile-card" aria-labelledby="signin-welcome-heading">
    <h3 id="signin-welcome-heading">{status === "loading" ? "Welcome" : status === "premium" ? "Welcome back" : status === "error" ? "You're signed in" : "You are in view-only mode"}</h3>
    <p>{status === "loading" ? "Checking your subscription…" : status === "premium" ? "Your Premium subscription is active." : status === "error" ? "We couldn't check your subscription. Open subscription options to try again." : "Get Premium to unlock all tools."}</p>
    <div className="cloud-actions">
      {status !== "premium" && <button type="button" className="btn-primary" disabled={status === "loading"} onClick={() => setShowPlans(true)}>{status === "error" ? "Subscription options" : "Get Premium"}</button>}
      <button type="button" onClick={onClose}>{status === "free" ? "Continue in view-only mode" : "Continue"}</button>
    </div>
    {showPlans && <SubscriptionSection user={cloud.user} client={cloud.client} offline={cloud.offline} initiallyOpen />}
  </section>;
}
