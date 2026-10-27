import React from "react";
import { cva } from "class-variance-authority";
import { cn } from "../../lib/cn.js";

const buttonVariants = cva("ui-button", {
  variants: {
    variant: {
      default: "ui-button--default",
      secondary: "ui-button--secondary",
      outline: "ui-button--outline",
      ghost: "ui-button--ghost",
      destructive: "ui-button--destructive",
    },
    size: { default: "ui-button--default-size", sm: "ui-button--sm", lg: "ui-button--lg", icon: "ui-button--icon" },
  },
  defaultVariants: { variant: "default", size: "default" },
});

export const Button = React.forwardRef(function Button(
  { className, variant = "default", size = "default", type = "button", ...props },
  ref,
) {
  return <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
