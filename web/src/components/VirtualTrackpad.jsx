import React, { useEffect, useRef } from "react";

// Relative input only: the canvas owns coordinates, snapping and point placement.
export default function VirtualTrackpad({ onMove, onTap, width, height, opacity }) {
  const gesture = useRef(null);
  const moveRef = useRef(onMove);
  moveRef.current = onMove;
  useEffect(() => {
    let frame;
    const refresh = () => { moveRef.current(0, 0); frame = requestAnimationFrame(refresh); };
    refresh();
    return () => cancelAnimationFrame(frame);
  }, []);
  const move = (e) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 5) g.dragged = true;
    if (g.dragged) onMove(e.clientX - g.x, e.clientY - g.y, e);
    g.x = e.clientX; g.y = e.clientY;
  };
  return <div id="virtual-trackpad" className="virtual-trackpad" aria-label="Virtual trackpad — drag to aim, tap to place"
    style={{ width: `${width}vw`, height: `${height}px`, backgroundColor: `rgba(20, 27, 40, ${opacity / 100})` }}
    onContextMenu={(e) => e.preventDefault()} onClick={(e) => e.stopPropagation()}
    onDoubleClick={(e) => e.stopPropagation()}
    onPointerDown={(e) => {
      e.preventDefault(); e.stopPropagation();
      if (gesture.current || !e.isPrimary || e.button !== 0) return;
      gesture.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, time: performance.now(), dragged: false };
      e.currentTarget.setPointerCapture(e.pointerId);
    }}
    onPointerMove={(e) => { e.preventDefault(); e.stopPropagation(); move(e); }}
    onPointerUp={(e) => {
      e.preventDefault(); e.stopPropagation();
      const g = gesture.current;
      if (!g || g.id !== e.pointerId) return;
      move(e);
      if (!g.dragged && performance.now() - g.time < 350) onTap(e);
      gesture.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    }}
    onPointerCancel={(e) => { e.stopPropagation(); gesture.current = null; }}
    onLostPointerCapture={() => { gesture.current = null; }}>
    <span>Trackpad · drag to aim · tap to place</span>
  </div>;
}
