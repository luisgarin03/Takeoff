import React from "react";
import { cn } from "../../lib/cn.js";

const part = (name, Tag = "div") => React.forwardRef(function CardPart({ className, ...props }, ref) {
  return React.createElement(Tag, { ref, className: cn(`ui-card-${name}`, className), ...props });
});

export const Card = React.forwardRef(function Card({ className, ...props }, ref) {
  return <section ref={ref} className={cn("ui-card", className)} {...props} />;
});
export const CardHeader = part("header", "header");
export const CardTitle = part("title", "h2");
export const CardDescription = part("description", "p");
export const CardContent = part("content");
export const CardFooter = part("footer", "footer");
