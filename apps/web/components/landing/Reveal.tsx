"use client";

import {
  createElement,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from "react";

/**
 * Reveal — lightweight, dependency-free scroll-reveal wrapper.
 *
 * Replaces Framer Motion `whileInView` fade-up animations on the below-the-fold
 * landing sections so the spring engine (`motion/react`, ~32KB gz) stays off the
 * first-paint critical path. Visual parity with the prior `motion` config:
 *   initial   { opacity: 0, y: 30 }
 *   whileInView { opacity: 1, y: 0 }
 *   viewport  { once: true, margin: "-100px" }
 *
 * The actual transition lives in the `.reveal` / `.is-visible` CSS in globals.css.
 * `prefers-reduced-motion` is respected there (element renders fully visible).
 */
export interface RevealProps {
  /** The element/tag to render. Defaults to a div. */
  as?: ElementType;
  /** Stagger delay in seconds, mirroring motion's `transition.delay`. */
  delay?: number;
  /** IntersectionObserver bottom inset, mirroring motion's `viewport.margin`. */
  rootMargin?: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  id?: string;
}

export function Reveal({
  as: Tag = "div",
  delay = 0,
  rootMargin = "-100px",
  className,
  style,
  children,
  id,
}: RevealProps): React.JSX.Element {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (node === null) {
      return;
    }
    // If IntersectionObserver is unavailable (very old browsers / SSR edge),
    // fail open so content is always shown.
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry !== undefined && entry.isIntersecting) {
          setVisible(true);
          observer.disconnect(); // once: true
        }
      },
      { rootMargin: `0px 0px ${rootMargin} 0px`, threshold: 0 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [rootMargin]);

  const mergedStyle: CSSProperties =
    delay > 0 ? { ...style, ["--reveal-delay" as string]: `${delay}s` } : { ...style };

  const props: Record<string, unknown> = {
    ref,
    className: `reveal${visible ? " is-visible" : ""}${className !== undefined ? ` ${className}` : ""}`,
    style: mergedStyle,
  };
  if (id !== undefined) {
    props["id"] = id;
  }

  return createElement(Tag, props, children);
}
