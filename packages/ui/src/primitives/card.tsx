import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
  hoverable?: boolean;
}

const paddingStyles = {
  none: "",
  sm: "p-3",
  md: "p-5",
  lg: "p-7",
} as const;

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { children, className = "", padding = "md", hoverable = false, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      className={`bg-surface border border-border rounded-xl shadow-card ${
        hoverable ? "hover:shadow-card-hover transition-shadow duration-200" : ""
      } ${paddingStyles[padding]} ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
});

Card.displayName = "Card";

export interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  className?: string;
}

export const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(function CardHeader(
  { children, className = "", ...props },
  ref
) {
  return (
    <div
      ref={ref}
      className={`pb-4 border-b border-border ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
});

CardHeader.displayName = "CardHeader";

export interface CardContentProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  className?: string;
}

export const CardContent = forwardRef<HTMLDivElement, CardContentProps>(function CardContent(
  { children, className = "", ...props },
  ref
) {
  return (
    <div ref={ref} className={`py-4 ${className}`.trim()} {...props}>
      {children}
    </div>
  );
});

CardContent.displayName = "CardContent";

export interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  className?: string;
}

export const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(function CardFooter(
  { children, className = "", ...props },
  ref
) {
  return (
    <div
      ref={ref}
      className={`pt-4 border-t border-border ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
});

CardFooter.displayName = "CardFooter";
