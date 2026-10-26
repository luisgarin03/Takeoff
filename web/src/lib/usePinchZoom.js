import { useRef } from "react";

// Capture at the canvas boundary so gestures also work over notes and overlays.
export function usePinchZoom({ getView, setView, onStart, min = 0.05, max = 12 }) {
  const touches = useRef(new Map());
  const pinch = useRef(null);
  const stop = (event) => { event.preventDefault(); event.stopPropagation(); };
  const local = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  return {
    onPointerDownCapture(event) {
      if (event.pointerType !== "touch") return;
      touches.current.set(event.pointerId, local(event));
      if (touches.current.size < 2) return;
      stop(event);
      onStart?.();
      const [a, b] = [...touches.current.values()];
      pinch.current = { view: { ...getView() }, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMoveCapture(event) {
      if (!touches.current.has(event.pointerId)) return;
      touches.current.set(event.pointerId, local(event));
      const start = pinch.current;
      if (!start) return;
      stop(event);
      if (touches.current.size < 2) return;
      const [a, b] = [...touches.current.values()];
      const scale = Math.min(max, Math.max(min, start.view.scale * Math.hypot(a.x - b.x, a.y - b.y) / start.distance));
      const ratio = scale / start.view.scale;
      setView({ scale, x: (a.x + b.x) / 2 - (start.x - start.view.x) * ratio, y: (a.y + b.y) / 2 - (start.y - start.view.y) * ratio });
    },
    onPointerUpCapture(event) { finish(event); },
    onPointerCancelCapture(event) { finish(event); },
  };
  function finish(event) {
    if (!touches.current.has(event.pointerId)) return;
    touches.current.delete(event.pointerId);
    if (pinch.current) stop(event);
    if (!touches.current.size) pinch.current = null;
  }
}
