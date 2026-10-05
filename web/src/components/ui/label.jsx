import React from "react";
import { cn } from "../../lib/cn.js";

export const Label = React.forwardRef(function Label({ className, ...props }, ref) {
  return <label ref={ref} className={cn("ui-label", className)} {...props} />;
});
