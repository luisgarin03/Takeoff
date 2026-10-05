import React from "react";
import { cn } from "../../lib/cn.js";

export function Badge({ className, variant = "secondary", ...props }) {
  return <span className={cn("ui-badge", `ui-badge--${variant}`, className)} {...props} />;
}
