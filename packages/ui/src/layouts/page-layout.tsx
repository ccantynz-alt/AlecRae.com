"use client";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";

export interface PageLayoutProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  actions?: ReactNode;
  header?: ReactNode;
  children?: ReactNode;
  className?: string;
  fullWidth?: boolean;
}

export const PageLayout = forwardRef<HTMLDivElement, PageLayoutProps>(function PageLayout(
  { title, description, actions, header, children, className = "", fullWidth = false, ...props },
  ref
) {
  return (
    <Box ref={ref} className={`flex flex-col flex-1 min-h-0 ${className}`} {...props}>
      {(title || header || actions) && (
        <PageLayoutHeader
          {...(title !== undefined ? { title } : {})}
          {...(description !== undefined ? { description } : {})}
          {...(actions !== undefined ? { actions } : {})}
          {...(header !== undefined ? { header } : {})}
        />
      )}
      <Box className={`flex-1 overflow-auto ${fullWidth ? "" : "px-6 py-6"}`}>
        {children}
      </Box>
    </Box>
  );
});

PageLayout.displayName = "PageLayout";

interface PageLayoutHeaderProps {
  title?: string;
  description?: string;
  actions?: ReactNode;
  header?: ReactNode;
}

function PageLayoutHeader({ title, description, actions, header }: PageLayoutHeaderProps) {
  if (header) {
    return (
      <Box className="px-6 py-4 border-b border-border bg-surface">
        {header}
      </Box>
    );
  }

  return (
    <Box className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface">
      <Box>
        {title && <Text variant="heading-lg">{title}</Text>}
        {description && (
          <Text variant="body-sm" muted>
            {description}
          </Text>
        )}
      </Box>
      {actions && <Box className="flex items-center gap-2">{actions}</Box>}
    </Box>
  );
}

PageLayoutHeader.displayName = "PageLayoutHeader";
