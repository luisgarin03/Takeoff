import React from "react";
import { cn } from "../../lib/cn.js";

export function Alert({ className, variant = "default", ...props }) {
  return <div role={variant === "destructive" ? "alert" : "status"} className={cn("ui-alert", `ui-alert--${variant}`, className)} {...props} />;
}
export function AlertTitle({ className, ...props }) { return <strong className={cn("ui-alert-title", className)} {...props} />; }
export function AlertDescription({ className, ...props }) { return <div className={cn("ui-alert-description", className)} {...props} />; }
