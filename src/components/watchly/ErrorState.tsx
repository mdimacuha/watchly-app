import React, { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { AlertTriangle, LucideIcon } from "lucide-react";

interface ErrorStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function ErrorState({
  icon: Icon = AlertTriangle,
  title,
  description,
  action,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center text-center p-8 min-h-[300px] w-full max-w-md mx-auto",
        className
      )}
    >
      {Icon && (
        <div className="mb-6 h-16 w-16 rounded-full bg-secondary/30 flex items-center justify-center">
          <Icon className="h-8 w-8 text-muted-foreground" />
        </div>
      )}
      <h3 className="text-h3 text-foreground mb-2">{title}</h3>
      {description && (
        <p className="text-body-regular text-muted-foreground mb-6 max-w-sm">
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
