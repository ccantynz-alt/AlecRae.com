import { createElement, forwardRef, type ComponentPropsWithoutRef, type ElementType, type ReactNode } from "react";

interface BoxOwnProps<T extends ElementType = "div"> {
  as?: T;
  children?: ReactNode;
  className?: string;
}

type BoxProps<T extends ElementType = "div"> = BoxOwnProps<T> &
  Omit<ComponentPropsWithoutRef<T>, keyof BoxOwnProps<T>>;

type BoxComponent = <T extends ElementType = "div">(
  props: BoxProps<T> & { ref?: React.Ref<Element> }
) => ReactNode;

export const Box: BoxComponent = forwardRef(function Box<T extends ElementType = "div">(
  { as, className, children, ...props }: BoxProps<T>,
  ref: React.Ref<Element>
) {
  const Component = (as || "div") as ElementType;
  return createElement(
    Component,
    { ref, className, ...props } as Record<string, unknown>,
    children,
  );
}) as BoxComponent;

(Box as { displayName?: string }).displayName = "Box";

export type { BoxProps };
