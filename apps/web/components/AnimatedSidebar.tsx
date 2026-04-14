"use client";

/**
 * AnimatedSidebar — sidebar with spring-physics width transitions.
 *
 * Replaces CSS `transition-all` with Framer Motion spring-based width
 * animation for the collapse/expand toggle. The sidebar labels fade in/out
 * on a slight delay so they don't clip during the width change.
 */

import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import {
  SPRING_BOUNCY,
  SPRING_PRECISE,
  useAlecRaeReducedMotion,
} from "../lib/animations";

export interface AnimatedSidebarNavItem {
  id: string;
  label: string;
  href: string;
  icon?: ReactNode;
  badge?: string | number;
  active?: boolean;
}

export interface AnimatedSidebarSection {
  title?: string;
  items: AnimatedSidebarNavItem[];
}

export interface AnimatedSidebarProps {
  brand?: ReactNode;
  sections: AnimatedSidebarSection[];
  footer?: ReactNode;
  collapsed: boolean;
  onNavigate?: (item: AnimatedSidebarNavItem) => void;
  className?: string;
}

export function AnimatedSidebar({
  brand,
  sections,
  footer,
  collapsed,
  onNavigate,
  className,
}: AnimatedSidebarProps): React.ReactNode {
  const reduced = useAlecRaeReducedMotion();

  return (
    <motion.nav
      aria-label="Main navigation"
      className={`flex flex-col h-full bg-surface border-r border-border overflow-hidden ${className ?? ""}`}
      animate={{
        width: collapsed ? 64 : 256,
      }}
      transition={reduced ? { duration: 0 } : SPRING_BOUNCY}
      style={{ willChange: "width" }}
    >
      {brand && (
        <motion.div className="px-4 py-5 border-b border-border">
          {brand}
        </motion.div>
      )}
      <motion.div className="flex-1 overflow-y-auto py-2">
        {sections.map((section, sectionIndex) => (
          <SidebarSectionGroup
            key={sectionIndex}
            section={section}
            collapsed={collapsed}
            onNavigate={onNavigate ?? noop}
            reduced={reduced}
          />
        ))}
      </motion.div>
      {footer && (
        <motion.div className="px-4 py-4 border-t border-border">
          {footer}
        </motion.div>
      )}
    </motion.nav>
  );
}

function noop(_item: AnimatedSidebarNavItem): void {
  // intentionally empty — default no-op for optional onNavigate
}

interface SidebarSectionGroupProps {
  section: AnimatedSidebarSection;
  collapsed: boolean;
  onNavigate: (item: AnimatedSidebarNavItem) => void;
  reduced: boolean;
}

function SidebarSectionGroup({
  section,
  collapsed,
  onNavigate,
  reduced,
}: SidebarSectionGroupProps): React.ReactNode {
  return (
    <div className="px-2 py-2">
      <AnimatePresence>
        {section.title && !collapsed && (
          <motion.span
            key={section.title}
            className="block px-2 py-1 text-caption font-semibold uppercase tracking-wider text-content-tertiary"
            initial={reduced ? false : { opacity: 0, x: -8 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, x: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, x: -8 }}
            transition={reduced ? { duration: 0 } : { duration: 0.15 }}
          >
            {section.title}
          </motion.span>
        )}
      </AnimatePresence>
      <ul role="list" className="space-y-0.5">
        {section.items.map((item) => (
          <SidebarNavItemRow
            key={item.id}
            item={item}
            collapsed={collapsed}
            onNavigate={onNavigate}
            reduced={reduced}
          />
        ))}
      </ul>
    </div>
  );
}

SidebarSectionGroup.displayName = "SidebarSectionGroup";

interface SidebarNavItemRowProps {
  item: AnimatedSidebarNavItem;
  collapsed: boolean;
  onNavigate: (item: AnimatedSidebarNavItem) => void;
  reduced: boolean;
}

function SidebarNavItemRow({
  item,
  collapsed,
  onNavigate,
  reduced,
}: SidebarNavItemRowProps): React.ReactNode {
  return (
    <li>
      <motion.a
        href={item.href}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-body-sm ${
          item.active
            ? "bg-brand-50 text-brand-700 font-medium"
            : "text-content-secondary hover:bg-surface-tertiary hover:text-content"
        } ${collapsed ? "justify-center" : ""}`}
        onClick={(e: React.MouseEvent) => {
          e.preventDefault();
          onNavigate(item);
        }}
        whileHover={reduced ? { scale: 1 } : { x: 2 }}
        whileTap={reduced ? { scale: 1 } : { scale: 0.98 }}
        transition={SPRING_PRECISE}
      >
        {item.icon && (
          <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
            {item.icon}
          </span>
        )}
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              key={`label-${item.id}`}
              className="flex-1 truncate"
              initial={reduced ? false : { opacity: 0, width: 0 }}
              animate={reduced ? { opacity: 1 } : { opacity: 1, width: "auto" }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, width: 0 }}
              transition={reduced ? { duration: 0 } : { duration: 0.15 }}
            >
              {item.label}
            </motion.span>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {!collapsed && item.badge !== undefined && (
            <motion.span
              key={`badge-${item.id}`}
              className="px-1.5 py-0.5 bg-brand-100 text-brand-700 rounded-full font-medium min-w-[1.25rem] text-center text-caption"
              initial={reduced ? false : { scale: 0.6, opacity: 0 }}
              animate={reduced ? { opacity: 1 } : { scale: 1, opacity: 1 }}
              exit={reduced ? { opacity: 0 } : { scale: 0.6, opacity: 0 }}
              transition={
                reduced
                  ? { duration: 0 }
                  : { type: "spring", stiffness: 500, damping: 20, mass: 0.5 }
              }
            >
              {item.badge}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.a>
    </li>
  );
}

SidebarNavItemRow.displayName = "SidebarNavItemRow";
