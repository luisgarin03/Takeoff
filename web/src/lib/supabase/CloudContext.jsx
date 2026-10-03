import { SHARING_UI_ENABLED } from "../sharingVisibility.js";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { configuration, getSupabase } from "./client.js";
import { createAuth, restoreGoogleReturn } from "./auth.js";
import { listenForDriveReturn } from "./driveConnection.js";

import { createDriveFiles } from "./driveFiles.js";
import { accountProfile } from "./accountProfile.js";
import { cloudStatusLabel } from "../projectMetadata.js";

const Context = createContext(null);
export function CloudProvider({ children }) {
  const [client, setClient] = useState(null), [session, setSession] = useState(null);
  const [ready, setReady] = useState(!configuration.configured), [offline, setOffline] = useState(!navigator.onLine);
  const [driveState, setDriveState] = useState(null);
  const [profile, setProfile] = useState(null);
  const userId = session?.user?.id;
  const [invitations, setInvitations] = useState(null);
  const refreshInvitations = useCallback(async () => {
    if (!SHARING_UI_ENABLED || !client || !userId) return;
    const { count, error } = await client.from("otk_project_invitations").select("id", { count: "exact", head: true }).neq("sender_id", userId).eq("state", "ready").is("imported_at", null).gt("expires_at", new Date().toISOString());
    const { data } = await client.auth.getSession();
    if (data.session?.user?.id === userId) setInvitations({ userId, count: error ? 0 : count || 0 });
  }, [client, userId]);
  useEffect(() => {
    if (!SHARING_UI_ENABLED || !client || !userId || offline) return;
    const refresh = () => { if (!document.hidden) refreshInvitations().catch(() => {}); };
    refresh();
    const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [client, userId, offline, refreshInvitations]);
  const refreshDrive = useCallback(async () => {
    if (!client || !userId) return;
    const assertUser = async () => { const { data } = await client.auth.getSession(); if (data.session?.user?.id !== userId) throw new Error("OTK_AUTH"); };
    const state = await createDriveFiles({ client, ...configuration, userId, assertUser }).status();
    await assertUser(); setDriveState({ ...state, userId });
    return state;
  }, [client, userId]);
  const refreshProfile = useCallback(async () => {
    if (!client || !userId) return;
    const { data, error } = await client.from("otk_profiles").select("display_name").eq("id", userId).maybeSingle();
    if (error) throw error;
    const { data: current } = await client.auth.getSession();
    if (current.session?.user?.id === userId) setProfile({ userId, name: data?.display_name || "" });
  }, [client, userId]);
  const [status, setStatus] = useState("Local Only");
  const [authReturn, setAuthReturn] = useState(null);
  const clearAuthReturn = useCallback(() => setAuthReturn(null), []);
  const [driveReturn, setDriveReturn] = useState(null);
  const clearDriveReturn = useCallback(() => setDriveReturn(null), []);
  useEffect(() => {
    let live = true;
    if (client && userId) {
      refreshDrive().catch(() => { if (live) setDriveState(null); });
      client.from("otk_profiles").select("display_name").eq("id", userId).maybeSingle().then(({ data }) => { if (live) setProfile({ userId, name: data?.display_name || "" }); }).catch(() => {});
    }
    return () => { live = false; };
  }, [client, userId, refreshDrive, driveReturn]);
  useEffect(() => {
    let live = true, cleanup;
    const controller = new AbortController();
    listenForDriveReturn((result) => { if (live) setDriveReturn(result); }, controller.signal).then((stop) => {
      if (live) cleanup = stop; else stop();
    }).catch(() => {});
    return () => { live = false; controller.abort(); cleanup?.(); };
  }, []);
  useEffect(() => {
    let live = true, unsubscribe;
    if (configuration.configured) getSupabase().then(async (c) => {
      if (!live) return;
      setClient(c);
      const auth = createAuth(c);
      let authEvent = false;
      unsubscribe = auth.subscribe((s) => { authEvent = true; if (live) setSession(s); });
      // A late initial read must not resurrect a session after a sign-out event.
      try {
        const returned = await restoreGoogleReturn(c);
        if (!live) return;
        if (returned) setAuthReturn(returned);
        const result = await auth.session();
        if (live && !authEvent) setSession(result.session);
      }
      finally { if (live) setReady(true); }
    }).catch(() => { if (live) setReady(true); });
    const connection = () => setOffline(!navigator.onLine);
    window.addEventListener("online", connection); window.addEventListener("offline", connection);
    return () => { live = false; unsubscribe?.(); window.removeEventListener("online", connection); window.removeEventListener("offline", connection); };
  }, []);
  const driveConnected = !!userId && driveState?.userId === userId && driveState.connected;
  const displayStatus = cloudStatusLabel({ ready, user: session?.user, driveConnected, offline, status });
  const identity = accountProfile(session?.user, profile?.userId === userId ? profile?.name : "");
  return <Context.Provider value={{ invitationCount: invitations?.userId === userId ? invitations?.count || 0 : 0, refreshInvitations, identity, refreshProfile, driveConnected, refreshDrive, displayStatus, profileName: profile?.userId === userId ? profile?.name || "" : "", client, user: session?.user || null, ready, offline, configuration, status, setStatus, authReturn, clearAuthReturn, driveReturn, clearDriveReturn }}>{children}</Context.Provider>;
}
export const useCloud = () => useContext(Context);
