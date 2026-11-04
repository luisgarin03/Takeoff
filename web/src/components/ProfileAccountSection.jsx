import React from "react";
import AccountAvatar from "./AccountAvatar.jsx";
import SubscriptionSection from "./SubscriptionSection.jsx";

export default function ProfileAccountSection({ cloud, displayName, busy, onNameChange, onSave, onSignOut, googleConnected, onDisconnectGoogle }) {
  return <div className="profile-sections">
    <section className="profile-card" aria-labelledby="profile-details-heading">
      <div className="profile-identity"><AccountAvatar profile={cloud.identity} size={48} /><div><h3 id="profile-details-heading">{cloud.identity.name}</h3><p className="profile-muted">Your profile</p></div></div>
      <form className="profile-details-form" onSubmit={onSave}>
        <label>Display name<input value={displayName} maxLength={120} autoComplete="name" onChange={(event) => onNameChange(event.target.value)} /></label>
        <label>Email<input type="email" value={cloud.identity.email} readOnly autoComplete="email" /></label>
        <div><button className="btn-primary" disabled={busy || cloud.offline}>Save profile</button></div>
      </form>
    </section>
    <section className="profile-card" aria-labelledby="profile-google-heading">
      <h3 id="profile-google-heading">Google access</h3>
      <p className="profile-muted">{googleConnected ? "A Google connection is active for features you enabled." : "No optional Google Calendar connection is active."}</p>
      {googleConnected && <button type="button" disabled={busy || cloud.offline} onClick={onDisconnectGoogle}>Disconnect Google access</button>}
      <p className="profile-muted">Disconnecting removes ESTIMATING’s saved Google authorization and local download cache. It does not delete your Google account, files, or ESTIMATING account. <a href="https://myaccount.google.com/connections" target="_blank" rel="noopener noreferrer">Manage Google Account connections</a> · <a href="https://estimating.studio/legal/privacy" target="_blank" rel="noopener noreferrer">Privacy policy</a></p>
    </section>
    <SubscriptionSection key={cloud.user.id} user={cloud.user} offline={cloud.offline} client={cloud.client} />
    <section className="profile-card" aria-labelledby="profile-account-heading">
      <h3 id="profile-account-heading">Account</h3><p className="profile-muted">Signed in as {cloud.identity.email}</p>
      <button type="button" disabled={busy} onClick={onSignOut}>Log out</button>
    </section>
  </div>;
}
