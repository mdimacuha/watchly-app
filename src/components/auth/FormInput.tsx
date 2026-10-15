import * as React from "react";
import { Input, InputProps } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import Link from "next/link";

interface FormInputProps extends InputProps {
  label: string;
  error?: string;
  forgotPasswordLink?: string;
  isPassword?: boolean;
}

const FormInput = React.forwardRef<HTMLInputElement, FormInputProps>(
  (
    {
      label,
      error,
      forgotPasswordLink,
      isPassword,
      className,
      disabled,
      type = "text",
      ...props
    },
    ref
  ) => {
    const [showPassword, setShowPassword] = React.useState(false);
    const inputType = isPassword ? (showPassword ? "text" : "password") : type;

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label
            htmlFor={props.id}
            className="text-sm font-medium text-muted-foreground block"
          >
            {label}
          </label>
          {forgotPasswordLink && (
            <Link
              href={forgotPasswordLink}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Forgot password?
            </Link>
          )}
        </div>
        <div className="relative">
          <Input
            ref={ref}
            type={inputType}
            disabled={disabled}
            className={cn(
              "h-11 bg-secondary/30 border-border/50 focus-visible:ring-primary focus-visible:border-primary/50",
              isPassword && "pr-10",
              error && "border-destructive/50 focus-visible:ring-destructive/20",
              className
            )}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              // Keep the reveal toggle out of the primary Tab sequence so
              // keyboard users move Password → Confirm Password directly. It
              // stays reachable via mouse/touch and screen readers (labelled).
              tabIndex={-1}
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
              disabled={disabled}
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
        {error && (
          <div className="flex items-center gap-2 text-xs text-destructive mt-1 animate-in slide-in-from-top-1 fade-in duration-200">
            <AlertCircle className="w-3 h-3" />
            <span>{error}</span>
          </div>
        )}
      </div>
    );
  }
);
FormInput.displayName = "FormInput";

export { FormInput };
