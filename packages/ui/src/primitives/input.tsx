import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { Box } from "./box";
import { Text } from "./text";

const variantStyles = {
  text: "",
  email: "",
  password: "",
  search: "pl-10",
} as const;

export type InputVariant = keyof typeof variantStyles;

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  variant?: InputVariant;
  label?: string;
  error?: string;
  hint?: string;
  icon?: ReactNode;
  inputSize?: "sm" | "md" | "lg";
  className?: string;
}

const sizeStyles = {
  sm: "h-8 px-3 text-body-sm rounded-md",
  md: "h-10 px-3 text-body-md rounded-lg",
  lg: "h-12 px-4 text-body-lg rounded-lg",
} as const;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    variant = "text",
    label,
    error,
    hint,
    icon,
    inputSize = "md",
    className = "",
    id,
    ...props
  },
  ref
) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <Box className="flex flex-col gap-1.5">
      {label && (
        <Text as="label" variant="label" htmlFor={inputId}>
          {label}
        </Text>
      )}
      <Box className="relative">
        {icon && variant === "search" && (
          <Box className="absolute left-3 top-1/2 -translate-y-1/2 text-content-tertiary">
            {icon}
          </Box>
        )}
        <input
          ref={ref}
          id={inputId}
          type={variant === "search" ? "search" : variant}
          className={`w-full border bg-surface transition-colors duration-150 placeholder:text-content-tertiary focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed ${
            error ? "border-status-error" : "border-border"
          } ${sizeStyles[inputSize]} ${variantStyles[variant]} ${className}`.trim()}
          {...props}
        />
      </Box>
      {error && (
        <Text variant="caption" className="text-status-error">
          {error}
        </Text>
      )}
      {hint && !error && (
        <Text variant="caption">{hint}</Text>
      )}
    </Box>
  );
});

Input.displayName = "Input";
