import LongTaskLoader from "./LongTaskLoader.jsx";

const LOADING_PREFIX = /^(building|checking|downloading|finding|importing|installing|loading|opening|preparing|reading|restarting|retrying|saving|scanning|uploading|verifying)\b/i;

export function isLoadingToastMessage(message) {
  const text = String(message || "").trim();
  return !!text && (text.endsWith("…") || LOADING_PREFIX.test(text));
}

export default function AppToast({
  message,
  title = "",
  loading = false,
  danger = false,
  onDismiss,
  children,
  className = "",
  style,
}) {
  const label = title || message || "Notification";
  return (
    <aside
      className={["app-toast", loading && "app-toast--loading", danger && "app-toast--danger", className].filter(Boolean).join(" ")}
      role={danger ? "alert" : "status"}
      aria-live={danger ? "assertive" : "polite"}
      aria-atomic="true"
      style={style}
    >
      {loading && <LongTaskLoader active label={label} compact delay={0} announce={false} className="app-toast__loader" />}
      <div className="app-toast__content">
        {title && <strong className="app-toast__title">{title}</strong>}
        {message && <span className="app-toast__description">{message}</span>}
        {children}
      </div>
      {onDismiss && <button type="button" className="app-toast__close" onClick={onDismiss} aria-label="Dismiss notification">×</button>}
    </aside>
  );
}
