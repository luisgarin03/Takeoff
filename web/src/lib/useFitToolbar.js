import { useLayoutEffect } from "react";

// Fit the complete header without wrapping or clipping any controls.
export function useFitToolbar(ref) {
  useLayoutEffect(() => {
    const header = ref.current;
    if (!header) return;
    const fit = () => {
      header.style.zoom = "1";
      const available = header.parentElement.clientWidth - 12;
      header.style.zoom = String(Math.min(1, available / Math.max(header.scrollWidth, 1)));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(header.parentElement);
    const mutations = new MutationObserver(fit);
    mutations.observe(header, { childList: true, subtree: true, characterData: true });
    return () => { observer.disconnect(); mutations.disconnect(); };
  }, [ref]);
}
