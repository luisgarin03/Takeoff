import { useLayoutEffect } from "react";

// Fit the header without clipping its controls.
export function useFitToolbar(ref) {
  useLayoutEffect(() => {
    const header = ref.current;
    if (!header) return;
    const isEstimating = header.classList.contains("estimating-toolbar-header");
    const fit = () => {
      header.style.zoom = "1";
      if (isEstimating || header.classList.contains("wb-header")) {
        header.toggleAttribute("data-single-row", !header.querySelector(".toolbar-trial-status"));
        if (Math.max(header.offsetWidth, header.scrollWidth) > header.parentElement.clientWidth - (isEstimating ? 0 : 10)) {
          header.removeAttribute("data-single-row");
        }
      }
      const twoRows = getComputedStyle(header).display === "grid";
      const inset = twoRows && isEstimating ? 0 : 12;
      const available = header.parentElement.clientWidth - inset;
      header.style.zoom = String(Math.min(1, available / Math.max(header.offsetWidth, header.scrollWidth, 1)));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(header.parentElement);
    const mutations = new MutationObserver(fit);
    mutations.observe(header, { childList: true, subtree: true, characterData: true });
    return () => { observer.disconnect(); mutations.disconnect(); };
  }, [ref]);
}
