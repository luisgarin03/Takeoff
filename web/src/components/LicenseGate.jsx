import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { BrandText } from "../brand/marks.jsx";
import { useCloud } from "../lib/supabase/CloudContext.jsx";
import { createAppBillingAdapter } from "../lib/stripeBilling.js";
import { createBillingService } from "../lib/subscriptions.js";
import { licenseRequired, resolveLicenseAccess, sandboxLicensesAllowed } from "../lib/license.js";
import { currentLicenseDevice, LICENSE_HEARTBEAT_MS } from "../lib/licenseSession.js";
import { LicenseAccessProvider } from "../lib/licenseAccess.jsx";
import { setProjectWritesBlocked } from "../lib/store.js";
import "../styles/cloud.css";

export default function LicenseGate({ children }) {
  const cloud = useCloud();
  const required = licenseRequired() || cloud.configuration.configured;
  const service = useMemo(() => createBillingService(createAppBillingAdapter(cloud.client)), [cloud.client]);
  const device = useMemo(() => currentLicenseDevice(), []);
  const [state, setState] = useState({ userId: "", loading: true, record: null, session: null, error: "" });
  const [refresh, setRefresh] = useState(0);
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    if (!cloud.user || !cloud.client) { setState({ userId: "", loading: false, record: null, session: null, error: "" }); return; }
    if (cloud.offline) { setState((value) => ({ ...value, loading: false, session: null, error: "" })); return; }
    let live = true;
    setState((value) => ({ ...value, loading: value.userId !== cloud.user.id || (!value.record && !value.session), error: "" }));
    service.claimLicenseSession(cloud.user, device).then((result) => {
      if (live) setState({ userId: cloud.user.id, loading: false, record: result.subscription, session: result.session, error: "" });
    }).catch(() => {
      if (live) setState((value) => ({ ...value, loading: false, session: null, error: "The license server could not be reached." }));
    });
    return () => { live = false; };
  }, [required, cloud.user, cloud.client, cloud.offline, service, device, refresh]);
  useEffect(() => {
    if (cloud.offline || !cloud.user) return undefined;
    const check = () => { if (!document.hidden) setRefresh((value) => value + 1); };
    const timer = window.setInterval(check, LICENSE_HEARTBEAT_MS);
    window.addEventListener("focus", check); document.addEventListener("visibilitychange", check);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", check); };
  }, [required, cloud.offline, cloud.user]);

  useEffect(() => {
    if (state.record?.subscriptionProvider !== "trial") return;
    const remaining = Date.parse(state.record.subscriptionCurrentPeriodEnd || "") - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(remaining + 1, 2147483647));
    return () => window.clearTimeout(timer);
  }, [state.record, now]);

  const stateBelongsToUser = !!cloud.user && state.userId === cloud.user.id;
  const access = resolveLicenseAccess({
    required, now, offline: cloud.offline, serverError: state.error,
    record: stateBelongsToUser ? state.record : null,
    session: stateBelongsToUser ? state.session : null,
    allowSandbox: sandboxLicensesAllowed(),
  });

  useLayoutEffect(() => {
    setProjectWritesBlocked(required && access.readOnly);
    return () => setProjectWritesBlocked(false);
  }, [required, access.readOnly]);

  if (!required) return <LicenseAccessProvider value={access}>{children}</LicenseAccessProvider>;
  if (!cloud.configuration.configured) return <main className="launch-gate"><div className="launch-card"><h1><BrandText /></h1><h2>Launch configuration required</h2><p>Supabase must be configured before license enforcement is enabled.</p></div></main>;
  if (!cloud.ready || !cloud.client) return <main className="launch-gate"><div className="launch-card"><h1><BrandText /></h1><p>Restoring your account…</p></div></main>;
  if (!cloud.user && cloud.offline) return <LicenseAccessProvider value={access}>
    <div className="license-readonly-banner" role="status"><strong>Read only</strong><span>{access.message}</span></div>
    {children}
  </LicenseAccessProvider>;
  if (!cloud.user) return <LicenseAccessProvider value={access}>{children}</LicenseAccessProvider>;
  if ((!stateBelongsToUser || state.loading) && !cloud.offline) return <main className="launch-gate"><div className="launch-card"><h1><BrandText /></h1><p>Checking your license and editing session…</p></div></main>;
  return <LicenseAccessProvider value={access}>{children}</LicenseAccessProvider>;
}
