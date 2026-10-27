import React, { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { BrandText } from "../brand/marks.jsx";
import googleLogo from "../brand/google-g.png";
import { useCloud } from "../lib/supabase/CloudContext.jsx";
import { createAuth, googleSignInUnavailable } from "../lib/supabase/auth.js";
import { authReturnPath } from "../lib/authNavigation.js";
import "../styles/authPages.css";
const ColorBendsBackground = lazy(() => import("../components/backgrounds/ColorBendsBackground.jsx"));

export default function AuthPage() {
  const cloud = useCloud(), location = useLocation(), navigate = useNavigate();
  const auth = useMemo(() => cloud.client ? createAuth(cloud.client) : null, [cloud.client]);
  const returnTo = authReturnPath(new URLSearchParams(location.search).get("returnTo") || "/");
  const [mode, setMode] = useState(new URLSearchParams(location.search).get("mode") === "signup" ? "signup" : "signin");
  const signup = mode === "signup";
  const [step, setStep] = useState(signup ? "signup" : "signin"), [email, setEmail] = useState(""), [name, setName] = useState(""), [password, setPassword] = useState(""), [code, setCode] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const disabled = busy || !cloud.ready || !auth || cloud.offline;
  const unavailable = googleSignInUnavailable();
  useEffect(() => { if (cloud.authReturn?.error) { setError(cloud.authReturn.error); cloud.clearAuthReturn(); } }, [cloud.authReturn, cloud.clearAuthReturn]);
  const titles = { signin: "Welcome back", signup: "Create your account", forgot: "Reset your password", confirm: "Check your email", recover: "Enter your recovery code", password: "Choose a new password" };
  function switchCard(next) {
    setMode(next); setStep(next); setPassword(""); setCode(""); setError(""); setMessage("");
  }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      if (step === "signin") { await auth.signIn(email.trim(), password); navigate("/?explore=1", { replace: true }); }
      else if (step === "signup") {
        const result = await auth.signUp(email.trim(), password, name.trim());
        if (result.session) navigate("/?explore=1", { replace: true });
        else { setStep("confirm"); setMessage("Enter the confirmation code sent to your email."); }
      } else if (step === "forgot") { await auth.forgotPassword(email.trim()); setStep("recover"); setMessage("If an account exists, a recovery email has been sent."); }
      else if (step === "confirm" || step === "recover") {
        await auth.verifyCode(email.trim(), code.trim(), step === "recover" ? "recovery" : "signup");
        if (step === "recover") setStep("password"); else navigate("/?explore=1", { replace: true });
        setCode("");
      } else if (step === "password") { await auth.updatePassword(password); navigate("/?explore=1", { replace: true }); }
      setPassword("");
    } catch (err) { setError(err.message || "Could not complete sign-in. Please try again."); }
    finally { setBusy(false); }
  }
  async function google() {
    setBusy(true); setError("");
    try { await auth.signInWithGoogle(new URL("/?explore=1", window.location.origin).href); }
    catch (err) { setError(err.message || "Google sign-in could not start."); setBusy(false); }
  }
  return <main className="auth-page">
    <Suspense fallback={null}><ColorBendsBackground /></Suspense>
    <section className="auth-page-card" aria-labelledby="auth-page-title">
      <div className="auth-page-logo"><BrandText /></div>
      <p className="auth-page-eyebrow">TAKEOFF · ONE WORKSPACE</p>
      <nav className="auth-page-modes" aria-label="Authentication mode"><button type="button" aria-pressed={!signup} disabled={busy} onClick={() => switchCard("signin")}>Login</button><button type="button" aria-pressed={signup} disabled={busy} onClick={() => switchCard("signup")}>Sign up</button></nav>
      <h1 id="auth-page-title">{titles[step]}</h1>
      <p className="auth-page-intro">{signup ? "Start your free 30-day trial. No card required." : "Sign in to your projects and estimating tools."}</p>
      {!cloud.configuration.configured && <p role="alert">Account sign-in is not configured for this build.</p>}
      {cloud.offline && <p role="status">You’re offline. Reconnect to sign in.</p>}
      <form key={step} onSubmit={submit}>
        {["signin", "signup"].includes(step) && <><button className="auth-page-google" type="button" disabled={disabled || !!unavailable} title={unavailable || undefined} onClick={google}><img src={googleLogo} alt="" width="20" height="20" />Continue with Google</button><div className="auth-page-divider"><span />or use email<span /></div></>}
        {step === "signup" && <label>Your name<input autoFocus required maxLength={120} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></label>}
        {step !== "password" && <label>Email<input autoFocus={!signup} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>}
        {["signin", "signup", "password"].includes(step) && <label>Password<input type="password" required minLength={step === "signin" ? 1 : 8} autoComplete={step === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} />{step === "signup" && <small>At least 8 characters</small>}</label>}
        {["confirm", "recover"].includes(step) && <label>Email code<input required autoComplete="one-time-code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} /></label>}
        {step === "signin" && <button className="auth-page-text-button" type="button" onClick={() => { setStep("forgot"); setError(""); setPassword(""); }}>Forgot password?</button>}
        {!["signin", "signup"].includes(step) && <button className="auth-page-text-button" type="button" onClick={() => { setStep(signup ? "signup" : "signin"); setError(""); setMessage(""); setCode(""); setPassword(""); }}>Back to {signup ? "sign up" : "sign in"}</button>}
        {error && <p role="alert" className="auth-page-error">{error}</p>}{message && <p role="status">{message}</p>}
        <button className="auth-page-submit" type="submit" disabled={disabled}>{busy ? "Please wait…" : step === "signin" ? "Sign in" : step === "signup" ? "Create account" : step === "forgot" ? "Send recovery email" : step === "password" ? "Save password" : "Verify email"}</button>
      </form>
      <p className="auth-page-switch">{signup ? "Already have an account? " : "New to Beitzell Estimating? "}<button type="button" disabled={busy} onClick={() => switchCard(signup ? "signin" : "signup")}>{signup ? "Sign in" : "Create an account"}</button></p>
      <Link className="auth-page-guest" to={returnTo === "/" ? "/?guest=1" : returnTo}>Continue in view-only mode</Link>
    </section>
  </main>;
}
