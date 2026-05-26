import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

const variantStyles = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 focus-visible:ring-brand-500",
  secondary:
    "bg-surface-secondary text-content border border-border hover:bg-surface-tertiary active:bg-surface-tertiary focus-visible:ring-brand-500",
  outline:
    "bg-transparent text-content border border-border hover:bg-surface-secondary active:bg-surface-tertiary focus-visible:ring-brand-500",
  ghost:
    "bg-transparent text-content hover:bg-surface-tertiary active:bg-surface-tertiary focus-visible:ring-brand-500",
  destructive:
    "bg-status-error text-white hover:bg-red-600 active:bg-red-700 focus-visible:ring-red-500",
} as const;

const sizeStyles = {
  sm: "h-8 px-3 text-body-sm gap-1.5 rounded-md",
  md: "h-10 px-4 text-body-md gap-2 rounded-lg",
  lg: "h-12 px-6 text-body-lg gap-2.5 rounded-lg",
  icon: "h-10 w-10 rounded-lg flex items-center justify-center",
} as const;

export type ButtonVariant = keyof typeof variantStyles;
export type ButtonSize = keyof typeof sizeStyles;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    icon,
    children,
    className = "",
    disabled,
    ...props
  },
  ref
) {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ${variantStyles[variant]} ${sizeStyles[size]} ${className}`.trim()}
      disabled={isDisabled}
      {...props}
    >
      {loading ? <LoadingSpinner /> : icon ? icon : null}
      {children}
    </button>
  );
});

Button.displayName = "Button";

function LoadingSpinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

LoadingSpinner.displayName = "LoadingSpinner";
