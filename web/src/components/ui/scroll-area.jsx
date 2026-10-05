import React from "react";
import { cn } from "../../lib/cn.js";

export const ScrollArea = React.forwardRef(function ScrollArea({ className, ...props }, ref) {
  return <div ref={ref} className={cn("ui-scroll-area", className)} {...props} />;
});
