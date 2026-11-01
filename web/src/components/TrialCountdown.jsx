import React, { useEffect, useState } from "react";
import { trialTimeRemaining } from "../lib/license.js";

export default function TrialCountdown({ subscription }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = trialTimeRemaining(subscription, now);
  if (!remaining) return null;
  const ends = new Date(subscription.subscriptionCurrentPeriodEnd).toLocaleString();
  return <span title={`Trial ends ${ends}`}>
    {remaining.expired ? "Free trial ended" : `Free trial · ${remaining.days}d ${remaining.hours}h ${remaining.minutes}m ${remaining.seconds}s`}
  </span>;
}
