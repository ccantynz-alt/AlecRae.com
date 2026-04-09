"use client";

import { forwardRef, useMemo, type HTMLAttributes } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Collaborator {
  userId: string;
  name: string;
  avatarUrl?: string | undefined;
  cursorColor: string;
  isOnline: boolean;
  role: "owner" | "editor" | "viewer";
}

export interface CollaboratorAvatarsProps
  extends HTMLAttributes<HTMLDivElement> {
  /** List of collaborators in the current session. */
  collaborators: Collaborator[];
  /** Maximum number of avatars to show before +N overflow. */
  maxVisible?: number;
  /** Size of each avatar in pixels. */
  size?: "sm" | "md" | "lg";
  /** Whether to show a tooltip on hover (uses native title attr). */
  showTooltip?: boolean;
  /** Callback when an avatar is clicked. */
  onCollaboratorClick?: ((collaborator: Collaborator) => void) | undefined;
  className?: string;
}

// ─── Size config ─────────────────────────────────────────────────────────────

const sizeConfig = {
  sm: { px: 24, text: "text-[10px]", ring: "ring-1", overlap: "-ml-1.5" },
  md: { px: 32, text: "text-xs", ring: "ring-2", overlap: "-ml-2" },
  lg: { px: 40, text: "text-sm", ring: "ring-2", overlap: "-ml-2.5" },
} as const;

// ─── Component ───────────────────────────────────────────────────────────────

export const CollaboratorAvatars = forwardRef<
  HTMLDivElement,
  CollaboratorAvatarsProps
>(function CollaboratorAvatars(
  {
    collaborators,
    maxVisible = 5,
    size = "md",
    showTooltip = true,
    onCollaboratorClick,
    className = "",
    ...props
  },
  ref,
) {
  const config = sizeConfig[size];

  const sortedCollaborators = useMemo(() => {
    // Online users first, then by role priority (owner > editor > viewer).
    const rolePriority: Record<string, number> = {
      owner: 0,
      editor: 1,
      viewer: 2,
    };
    return [...collaborators].sort((a, b) => {
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      return (
        (rolePriority[a.role] ?? 3) - (rolePriority[b.role] ?? 3)
      );
    });
  }, [collaborators]);

  const visible = sortedCollaborators.slice(0, maxVisible);
  const overflow = sortedCollaborators.length - maxVisible;

  function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
    }
    return (parts[0]?.slice(0, 2) ?? "??").toUpperCase();
  }

  return (
    <Box
      ref={ref}
      className={`flex items-center ${className}`}
      role="group"
      aria-label={`${collaborators.length} collaborator${collaborators.length === 1 ? "" : "s"}`}
      {...props}
    >
      {visible.map((collaborator, index) => (
        <Box
          key={collaborator.userId}
          className={`relative inline-flex items-center justify-center rounded-full ${config.ring} ring-surface-primary bg-surface-secondary cursor-pointer transition-transform hover:scale-110 hover:z-10 ${index > 0 ? config.overlap : ""}`}
          style={{
            width: config.px,
            height: config.px,
            borderColor: collaborator.cursorColor,
            zIndex: visible.length - index,
          }}
          onClick={() => onCollaboratorClick?.(collaborator)}
          role="button"
          tabIndex={0}
          aria-label={`${collaborator.name} (${collaborator.role}${collaborator.isOnline ? ", online" : ""})`}
          title={
            showTooltip
              ? `${collaborator.name} (${collaborator.role})`
              : undefined
          }
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onCollaboratorClick?.(collaborator);
            }
          }}
        >
          {collaborator.avatarUrl ? (
            <Box
              as="img"
              src={collaborator.avatarUrl}
              alt={collaborator.name}
              className="w-full h-full rounded-full object-cover"
              style={{ width: config.px, height: config.px }}
            />
          ) : (
            <Text
              variant="caption"
              className={`${config.text} font-semibold text-content select-none`}
            >
              {getInitials(collaborator.name)}
            </Text>
          )}

          {/* Online indicator dot */}
          {collaborator.isOnline && (
            <Box
              className="absolute bottom-0 right-0 rounded-full bg-status-success ring-2 ring-surface-primary"
              style={{
                width: size === "sm" ? 6 : size === "md" ? 8 : 10,
                height: size === "sm" ? 6 : size === "md" ? 8 : 10,
              }}
              aria-hidden="true"
            />
          )}
        </Box>
      ))}

      {/* Overflow count badge */}
      {overflow > 0 && (
        <Box
          className={`relative inline-flex items-center justify-center rounded-full ${config.ring} ring-surface-primary bg-surface-tertiary ${config.overlap}`}
          style={{
            width: config.px,
            height: config.px,
            zIndex: 0,
          }}
          aria-label={`${overflow} more collaborator${overflow === 1 ? "" : "s"}`}
        >
          <Text
            variant="caption"
            className={`${config.text} font-medium text-content-secondary select-none`}
          >
            +{overflow}
          </Text>
        </Box>
      )}
    </Box>
  );
});

CollaboratorAvatars.displayName = "CollaboratorAvatars";
