import React from "react";
import { cn } from "../../lib/cn.js";

export function Separator({ className, orientation = "horizontal", ...props }) {
  return <div role="separator" aria-orientation={orientation} className={cn("ui-separator", `ui-separator--${orientation}`, className)} {...props} />;
}
