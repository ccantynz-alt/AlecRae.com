import { createElement, forwardRef, type ComponentPropsWithoutRef, type ElementType, type ReactNode } from "react";

const variantStyles = {
  "display-lg": "text-display-lg font-bold tracking-tight",
  "display-md": "text-display-md font-bold tracking-tight",
  "display-sm": "text-display-sm font-semibold tracking-tight",
  "heading-lg": "text-heading-lg font-semibold",
  "heading-md": "text-heading-md font-semibold",
  "heading-sm": "text-heading-sm font-semibold",
  "body-lg": "text-body-lg",
  "body-md": "text-body-md",
  "body-sm": "text-body-sm",
  caption: "text-caption text-content-secondary",
  label: "text-body-sm font-medium",
} as const;

const variantElements: Record<TextVariant, ElementType> = {
  "display-lg": "h1",
  "display-md": "h2",
  "display-sm": "h3",
  "heading-lg": "h2",
  "heading-md": "h3",
  "heading-sm": "h4",
  "body-lg": "p",
  "body-md": "p",
  "body-sm": "p",
  caption: "span",
  label: "label",
};

export type TextVariant = keyof typeof variantStyles;

interface TextOwnProps<T extends ElementType = "p"> {
  as?: T;
  variant?: TextVariant;
  children?: ReactNode;
  className?: string;
  muted?: boolean;
}

type TextProps<T extends ElementType = "p"> = TextOwnProps<T> &
  Omit<ComponentPropsWithoutRef<T>, keyof TextOwnProps<T>>;

type TextComponent = <T extends ElementType = "p">(
  props: TextProps<T> & { ref?: React.Ref<Element> }
) => ReactNode;

export const Text: TextComponent = forwardRef(function Text<T extends ElementType = "p">(
  { as, variant = "body-md", className = "", muted, children, ...props }: TextProps<T>,
  ref: React.Ref<Element>
) {
  const Component = (as || variantElements[variant] || "p") as ElementType;
  const baseStyles = variantStyles[variant];
  const mutedStyle = muted ? "text-content-secondary" : "";
  return createElement(
    Component,
    {
      ref,
      className: `${baseStyles} ${mutedStyle} ${className}`.trim(),
      ...props,
    } as Record<string, unknown>,
    children,
  );
}) as TextComponent;

(Text as { displayName?: string }).displayName = "Text";

export type { TextProps };
