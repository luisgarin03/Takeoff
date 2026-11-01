import React, { useState } from 'react';
import { useLicenseAccess } from '../lib/licenseAccess.jsx';
import '../styles/membershipButtons.css';

export default function StartTrialButton() {
  const access = useLicenseAccess();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (access.reason !== 'trial_available') return null;
  return <span><button className="membership-action" type="button" disabled={busy} onClick={async () => {
    setBusy(true); setError('');
    try { await access.startTrial(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }}>{busy ? 'Starting trial…' : 'Start 30-day trial'}</button>
    {error && <span role="alert">{error}</span>}
  </span>;
}
