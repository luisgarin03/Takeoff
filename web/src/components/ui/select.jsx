import React from "react";
import { cn } from "../../lib/cn.js";

export const Select = React.forwardRef(function Select({ className, children, ...props }, ref) {
  return <select ref={ref} className={cn("ui-select", className)} {...props}>{children}</select>;
});
