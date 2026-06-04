import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      // 16px minimum: anything smaller triggers iOS Safari's focus auto-zoom.
      "h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-[16px] text-foreground outline-none transition placeholder:text-muted focus:border-primary",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
