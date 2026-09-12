import { Capacitor, registerPlugin } from "@capacitor/core";
import { StatusBar } from "@capacitor/status-bar";
import { useCallback, useEffect, useRef, useState } from "react";

// The Android implementation lives in android/app and is deliberately exposed
// through one tiny Capacitor bridge. Browser builds never invoke this proxy.
const ImmersiveFullscreen = registerPlugin("ImmersiveFullscreen");

const isAndroidNative = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

function scheduleViewportRefresh(callback) {
  const refresh = () => {
    window.dispatchEvent(new Event("resize"));
    callback?.();
  };
  const frame = requestAnimationFrame(refresh);
  // Android can report its final visual viewport a beat after the system bars
  // animate. A second pass refreshes only presentation, never the takeoff data.
  const timeout = window.setTimeout(() => requestAnimationFrame(refresh), 160);
  return () => {
    cancelAnimationFrame(frame);
    window.clearTimeout(timeout);
  };
}

/** Cross-platform fullscreen state and controls for a viewport-aware caller. */
export function useFullscreen(onViewportChange) {
  const [isFullscreen, setIsFullscreen] = useState(() =>
    typeof document !== "undefined" && !!document.fullscreenElement,
  );
  const fullscreenRef = useRef(isFullscreen);
  const refreshRef = useRef(onViewportChange);
  const refreshPendingRef = useRef(false);
  refreshRef.current = onViewportChange;

  const refreshViewport = useCallback(() => {
    // The refresh itself emits a resize event; suppress that echo so an Android
    // transition does not schedule an endless resize loop.
    if (refreshPendingRef.current) return;
    refreshPendingRef.current = true;
    scheduleViewportRefresh(() => refreshRef.current?.());
    window.setTimeout(() => { refreshPendingRef.current = false; }, 220);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const syncBrowserState = () => {
      const next = !!document.fullscreenElement;
      fullscreenRef.current = next;
      setIsFullscreen(next);
      refreshViewport();
    };
    document.addEventListener("fullscreenchange", syncBrowserState);
    return () => document.removeEventListener("fullscreenchange", syncBrowserState);
  }, [refreshViewport]);

  useEffect(() => {
    const onViewportResize = () => {
      if (fullscreenRef.current) refreshViewport();
    };
    window.addEventListener("resize", onViewportResize);
    window.addEventListener("orientationchange", onViewportResize);
    window.visualViewport?.addEventListener("resize", onViewportResize);
    return () => {
      window.removeEventListener("resize", onViewportResize);
      window.removeEventListener("orientationchange", onViewportResize);
      window.visualViewport?.removeEventListener("resize", onViewportResize);
    };
  }, [refreshViewport]);

  const enterFullscreen = useCallback(async () => {
    if (isAndroidNative()) {
      try {
        await StatusBar.hide();
        await ImmersiveFullscreen.setEnabled({ enabled: true });
        fullscreenRef.current = true;
        setIsFullscreen(true);
      } catch (error) {
        console.warn("Unable to enter Android fullscreen", error);
      }
      refreshViewport();
      return;
    }
    if (!document.documentElement.requestFullscreen) return;
    try {
      await document.documentElement.requestFullscreen();
    } catch (error) {
      // Fullscreen can be denied by browser policy; leave the UI usable.
      console.warn("Unable to enter browser fullscreen", error);
    }
  }, [refreshViewport]);

  const exitFullscreen = useCallback(async () => {
    if (isAndroidNative()) {
      try {
        await ImmersiveFullscreen.setEnabled({ enabled: false });
        await StatusBar.show();
      } catch (error) {
        console.warn("Unable to exit Android fullscreen", error);
      }
      fullscreenRef.current = false;
      setIsFullscreen(false);
      refreshViewport();
      return;
    }
    if (!document.fullscreenElement || !document.exitFullscreen) return;
    try {
      await document.exitFullscreen();
    } catch (error) {
      console.warn("Unable to exit browser fullscreen", error);
    }
  }, [refreshViewport]);

  const toggleFullscreen = useCallback(() => (
    fullscreenRef.current ? exitFullscreen() : enterFullscreen()
  ), [enterFullscreen, exitFullscreen]);

  return { isFullscreen, enterFullscreen, exitFullscreen, toggleFullscreen };
}
