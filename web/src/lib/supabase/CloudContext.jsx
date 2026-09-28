import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { configuration, getSupabase } from "./client.js";
import { createAuth, restoreGoogleReturn } from "./auth.js";
import { listenForDriveReturn } from "./driveConnection.js";

const Context = createContext(null);
export function CloudProvider({ children }) {
  const [client, setClient] = useState(null), [session, setSession] = useState(null);
  const [ready, setReady] = useState(!configuration.configured), [offline, setOffline] = useState(!navigator.onLine);
  const [status, setStatus] = useState("Local Only");
  const [authReturn, setAuthReturn] = useState(null);
  const clearAuthReturn = useCallback(() => setAuthReturn(null), []);
  const [driveReturn, setDriveReturn] = useState(null);
  const clearDriveReturn = useCallback(() => setDriveReturn(null), []);
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
  return <Context.Provider value={{ client, user: session?.user || null, ready, offline, configuration, status, setStatus, authReturn, clearAuthReturn, driveReturn, clearDriveReturn }}>{children}</Context.Provider>;
}
export const useCloud = () => useContext(Context);
