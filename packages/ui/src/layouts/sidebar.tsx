"use client";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";

export interface SidebarNavItem {
  id: string;
  label: string;
  href: string;
  icon?: ReactNode;
  badge?: string | number;
  active?: boolean;
}

export interface SidebarSection {
  title?: string;
  items: SidebarNavItem[];
}

export interface SidebarProps extends HTMLAttributes<HTMLElement> {
  brand?: ReactNode;
  sections: SidebarSection[];
  footer?: ReactNode;
  collapsed?: boolean;
  onNavigate?: (item: SidebarNavItem) => void;
  className?: string;
}

export const Sidebar = forwardRef<HTMLElement, SidebarProps>(function Sidebar(
  { brand, sections, footer, collapsed = false, onNavigate, className = "", ...props },
  ref
) {
  return (
    <Box
      ref={ref}
      as="nav"
      aria-label="Main navigation"
      className={`flex flex-col h-full bg-surface border-r border-border ${
        collapsed ? "w-16" : "w-64"
      } transition-all duration-200 ${className}`}
      {...props}
    >
      {brand && (
        <Box className="px-4 py-5 border-b border-border">
          {brand}
        </Box>
      )}
      <Box className="flex-1 overflow-y-auto py-2">
        {sections.map((section, sectionIndex) => (
          <SidebarSectionGroup
            key={sectionIndex}
            section={section}
            collapsed={collapsed}
            {...(onNavigate ? { onNavigate } : {})}
          />
        ))}
      </Box>
      {footer && (
        <Box className="px-4 py-4 border-t border-border">
          {footer}
        </Box>
      )}
    </Box>
  );
});

Sidebar.displayName = "Sidebar";

interface SidebarSectionGroupProps {
  section: SidebarSection;
  collapsed: boolean;
  onNavigate?: (item: SidebarNavItem) => void;
}

function SidebarSectionGroup({ section, collapsed, onNavigate }: SidebarSectionGroupProps) {
  return (
    <Box className="px-2 py-2">
      {section.title && !collapsed && (
        <Text variant="caption" className="px-2 py-1 font-semibold uppercase tracking-wider text-content-tertiary">
          {section.title}
        </Text>
      )}
      <Box as="ul" role="list" className="space-y-0.5">
        {section.items.map((item) => (
          <SidebarNavItemRow
            key={item.id}
            item={item}
            collapsed={collapsed}
            {...(onNavigate ? { onNavigate } : {})}
          />
        ))}
      </Box>
    </Box>
  );
}

SidebarSectionGroup.displayName = "SidebarSectionGroup";

interface SidebarNavItemRowProps {
  item: SidebarNavItem;
  collapsed: boolean;
  onNavigate?: (item: SidebarNavItem) => void;
}

function SidebarNavItemRow({ item, collapsed, onNavigate }: SidebarNavItemRowProps) {
  return (
    <Box as="li">
      <Box
        as="a"
        href={item.href}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-body-sm transition-colors duration-100 ${
          item.active
            ? "bg-brand-50 text-brand-700 font-medium"
            : "text-content-secondary hover:bg-surface-tertiary hover:text-content"
        } ${collapsed ? "justify-center" : ""}`}
        onClick={(e: React.MouseEvent) => {
          if (onNavigate) {
            e.preventDefault();
            onNavigate(item);
          }
        }}
      >
        {item.icon && (
          <Box className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
            {item.icon}
          </Box>
        )}
        {!collapsed && (
          <Text as="span" variant="body-sm" className="flex-1 truncate">
            {item.label}
          </Text>
        )}
        {!collapsed && item.badge !== undefined && (
          <Text
            as="span"
            variant="caption"
            className="px-1.5 py-0.5 bg-brand-100 text-brand-700 rounded-full font-medium min-w-[1.25rem] text-center"
          >
            {item.badge}
          </Text>
        )}
      </Box>
    </Box>
  );
}

SidebarNavItemRow.displayName = "SidebarNavItemRow";
