const VARIANTS = new Set(["inline", "overlay", "fixed"]);

export default function LongTaskLoader({
  active,
  label,
  delay = 350,
  variant = "inline",
  compact = false,
  className = "",
}) {
  if (!active) return null;

  const safeVariant = VARIANTS.has(variant) ? variant : "inline";
  const safeDelay = Number.isFinite(delay) ? Math.max(0, delay) : 350;
  const classes = [
    "long-task-loader",
    `long-task-loader--${safeVariant}`,
    compact && "long-task-loader--compact",
    className,
  ].filter(Boolean).join(" ");

  return (
    <div
      className={classes}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{ "--long-task-loader-delay": `${safeDelay}ms` }}
    >
      <span className="long-task-loader__label">{label || "Working…"}</span>
      <span className="long-task-loader__visual" aria-hidden="true">
        <span className="long-task-loader__bar" />
        <span className="long-task-loader__bar" />
        <span className="long-task-loader__bar" />
        <span className="long-task-loader__bar" />
      </span>
    </div>
  );
}
