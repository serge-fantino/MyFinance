import type { HTMLAttributes } from "react";
import { cn } from "@/utils/cn";

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "destructive" | "success";
}

function Alert({ className, variant = "default", ...props }: AlertProps) {
  const variants = {
    default: "bg-secondary text-secondary-foreground",
    destructive: "bg-destructive/10 text-destructive border-destructive/20",
    success: "bg-emerald-50 text-emerald-800 border-emerald-200",
  };

  return (
    <div
      role="alert"
      className={cn("relative w-full rounded-lg border p-4 text-sm", variants[variant], className)}
      {...props}
    />
  );
}

export { Alert };
