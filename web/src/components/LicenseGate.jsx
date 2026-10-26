import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { BrandText } from "../brand/marks.jsx";
import { useCloud } from "../lib/supabase/CloudContext.jsx";
import { createAuth } from "../lib/supabase/auth.js";
import { createAppBillingAdapter } from "../lib/stripeBilling.js";
import { createBillingService } from "../lib/subscriptions.js";
import { licenseRequired, resolveLicenseAccess, sandboxLicensesAllowed } from "../lib/license.js";
import { currentLicenseDevice, LICENSE_HEARTBEAT_MS } from "../lib/licenseSession.js";
import { FULL_ACCESS, LicenseAccessProvider } from "../lib/licenseAccess.jsx";
import { setProjectWritesBlocked } from "../lib/store.js";
import "../styles/cloud.css";

function AccountForm({ cloud }) {
  const [mode, setMode] = useState("signin"), [email, setEmail] = useState(""), [password, setPassword] = useState("");
  const [name, setName] = useState(""), [code, setCode] = useState(""), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const auth = cloud.client ? createAuth(cloud.client) : null;
  async function submit(event) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      if (mode === "signin") await auth.signIn(email.trim(), password);
      else if (mode === "signup") {
        const result = await auth.signUp(email.trim(), password, name.trim());
        if (!result.session) { setMode("confirm"); setMessage("Check your email for the confirmation code."); }
      } else if (mode === "forgot") { await auth.forgotPassword(email.trim()); setMode("recover"); setMessage("If the account exists, a recovery code was sent."); }
      else if (mode === "confirm" || mode === "recover") {
        await auth.verifyCode(email.trim(), code.trim(), mode === "recover" ? "recovery" : "signup");
        setMode(mode === "recover" ? "password" : "signin"); setCode("");
      } else if (mode === "password") { await auth.updatePassword(password); setMode("signin"); setMessage("Password updated. Sign in to continue."); }
      setPassword("");
    } catch (error) { setMessage(error.message || "Authentication failed. Please try again."); }
    finally { setBusy(false); }
  }
  return <form className="launch-auth" onSubmit={submit}>
    <h1><BrandText /></h1>
    <h2>{{ signin: "Sign in", signup: "Create account", forgot: "Reset password", confirm: "Confirm email", recover: "Enter recovery code", password: "Choose a new password" }[mode]}</h2>
    <p>Your account securely links your subscription and license across devices.</p>
    {mode !== "password" && <label>Email<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>}
    {mode === "signup" && <label>Display name<input required maxLength={120} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} /></label>}
    {["signin", "signup", "password"].includes(mode) && <label>Password<input type="password" required minLength={mode === "signin" ? 1 : 8} autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} /></label>}
    {["confirm", "recover"].includes(mode) && <label>Email code<input required inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} /></label>}
    <button className="btn-primary" disabled={busy || cloud.offline}>{busy ? "Working…" : "Continue"}</button>
    <div className="cloud-actions">
      {["signin", "signup", "forgot"].filter((item) => item !== mode).map((item) => <button type="button" key={item} disabled={busy} onClick={() => { setMode(item); setMessage(""); setPassword(""); }}>
        {item === "signup" ? "Create account" : item === "forgot" ? "Forgot password" : "Sign in"}
      </button>)}
    </div>
    {message && <p role="status">{message}</p>}
  </form>;
}

export default function LicenseGate({ children }) {
  const required = licenseRequired(), cloud = useCloud();
  const service = useMemo(() => createBillingService(createAppBillingAdapter(cloud.client)), [cloud.client]);
  const device = useMemo(() => currentLicenseDevice(), []);
  const [state, setState] = useState({ userId: "", loading: true, record: null, session: null, error: "" });
  const [refresh, setRefresh] = useState(0);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    if (!required || !cloud.user || !cloud.client) { setState({ userId: "", loading: false, record: null, session: null, error: "" }); return; }
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
    if (!required || cloud.offline || !cloud.user) return undefined;
    const check = () => { if (!document.hidden) setRefresh((value) => value + 1); };
    const timer = window.setInterval(check, LICENSE_HEARTBEAT_MS);
    window.addEventListener("focus", check); document.addEventListener("visibilitychange", check);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", check); };
  }, [required, cloud.offline, cloud.user]);

  const stateBelongsToUser = !!cloud.user && state.userId === cloud.user.id;
  const access = !required ? FULL_ACCESS : resolveLicenseAccess({
    required, offline: cloud.offline, serverError: state.error,
    record: stateBelongsToUser ? state.record : null,
    session: stateBelongsToUser ? state.session : null,
    allowSandbox: sandboxLicensesAllowed(),
  });

  useLayoutEffect(() => {
    setProjectWritesBlocked(required && access.readOnly);
    return () => setProjectWritesBlocked(false);
  }, [required, access.readOnly]);

  if (!required) return <LicenseAccessProvider value={FULL_ACCESS}>{children}</LicenseAccessProvider>;
  if (!cloud.configuration.configured) return <main className="launch-gate"><div className="launch-card"><h1><BrandText /></h1><h2>Launch configuration required</h2><p>Supabase must be configured before license enforcement is enabled.</p></div></main>;
  if (!cloud.ready || !cloud.client) return <main className="launch-gate"><div className="launch-card"><h1><BrandText /></h1><p>Restoring your account…</p></div></main>;
  if (!cloud.user && cloud.offline) return <LicenseAccessProvider value={access}>
    <div className="license-readonly-banner" role="status"><strong>Read only</strong><span>{access.message}</span></div>
    {children}
  </LicenseAccessProvider>;
  if (!cloud.user) return <main className="launch-gate"><AccountForm cloud={cloud} /></main>;
  if ((!stateBelongsToUser || state.loading) && !cloud.offline) return <main className="launch-gate"><div className="launch-card"><h1><BrandText /></h1><p>Checking your license and editing session…</p></div></main>;
  return <LicenseAccessProvider value={access}>
    {access.readOnly && <div className="license-readonly-banner" role="status">
      <strong>Read only</strong><span>{access.message}</span>
      <button type="button" disabled={checking || cloud.offline} onClick={async () => {
        setChecking(true);
        try { setRefresh((value) => value + 1); }
        finally { window.setTimeout(() => setChecking(false), 500); }
      }}>{checking ? "Checking…" : "Check again"}</button>
    </div>}
    {children}
  </LicenseAccessProvider>;
}

