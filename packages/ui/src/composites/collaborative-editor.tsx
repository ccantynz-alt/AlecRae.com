"use client";

import {
  forwardRef,
  useState,
  useCallback,
  useRef,
  useMemo,
  type HTMLAttributes,
} from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Button } from "../primitives/button";
import {
  CollaboratorAvatars,
  type Collaborator,
} from "./collaborator-avatars";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

/** Awareness state for a single user's cursor / selection. */
export interface AwarenessUserState {
  name: string;
  color: string;
  avatarUrl?: string;
  /** Pixel position for rendering a remote cursor label. */
  cursor?: { anchor: number; head: number } | null;
}

/**
 * Configuration for the collaborative editing session.
 * The parent provides the connection logic; this component renders
 * the editor surface and collaboration UI.
 */
export interface CollaborativeEditorConfig {
  /** WebSocket URL for the collab session. */
  websocketUrl: string;
  /** JWT token for authentication. */
  token: string;
  /** Session ID for tracking. */
  sessionId: string;
  /** Draft ID. */
  draftId: string;
}

export interface CollaborativeEditorProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** Collaboration session config (pass null to use as standalone editor). */
  collabConfig: CollaborativeEditorConfig | null;
  /** Current connection status (managed by parent via CollabDraft client). */
  connectionStatus?: ConnectionStatus | undefined;
  /** Remote collaborators currently in the session (from awareness). */
  collaborators?: Collaborator[] | undefined;
  /** The current user's info (for awareness). */
  currentUser: {
    userId: string;
    name: string;
    avatarUrl?: string | undefined;
    cursorColor?: string | undefined;
  };
  /** Initial HTML content (only used if no Yjs state exists). */
  initialContent?: string | undefined;
  /** Placeholder text when editor is empty. */
  placeholder?: string | undefined;
  /** Whether the editor is read-only. */
  readOnly?: boolean | undefined;
  /** Called when the local content changes. Receives the plain text + HTML. */
  onChange?: ((content: { text: string; html: string }) => void) | undefined;
  /** Called when connection status changes. */
  onConnectionChange?: ((status: ConnectionStatus) => void) | undefined;
  /** Called when a collaborator joins or leaves. */
  onCollaboratorsChange?: ((collaborators: Collaborator[]) => void) | undefined;
  /** Called to open the collaboration panel. */
  onOpenPanel?: (() => void) | undefined;
  /** Whether to show the toolbar. */
  showToolbar?: boolean | undefined;
  /** Whether to show the collaborator avatars strip. */
  showCollaborators?: boolean | undefined;
  /** Minimum height of the editor area. */
  minHeight?: number | undefined;
  className?: string | undefined;
}

// ─── Connection status display ───────────────────────────────────────────────

const statusDisplay: Record<
  ConnectionStatus,
  { label: string; dotClass: string }
> = {
  idle: { label: "Not connected", dotClass: "bg-content-tertiary" },
  connecting: { label: "Connecting...", dotClass: "bg-status-warning animate-pulse" },
  connected: { label: "Connected", dotClass: "bg-status-success" },
  reconnecting: {
    label: "Reconnecting...",
    dotClass: "bg-status-warning animate-pulse",
  },
  disconnected: { label: "Disconnected", dotClass: "bg-status-error" },
  error: { label: "Connection error", dotClass: "bg-status-error" },
};

// ─── Toolbar button data ─────────────────────────────────────────────────────

interface ToolbarAction {
  id: string;
  label: string;
  shortcut?: string | undefined;
  icon: string;
}

const toolbarActions: readonly ToolbarAction[] = [
  { id: "bold", label: "Bold", shortcut: "Mod+B", icon: "B" },
  { id: "italic", label: "Italic", shortcut: "Mod+I", icon: "I" },
  { id: "underline", label: "Underline", shortcut: "Mod+U", icon: "U" },
  {
    id: "strikethrough",
    label: "Strikethrough",
    shortcut: "Mod+Shift+X",
    icon: "S",
  },
  { id: "bullet-list", label: "Bullet List", icon: "\u2022" },
  { id: "ordered-list", label: "Numbered List", icon: "1." },
  { id: "blockquote", label: "Quote", icon: "\u201C" },
  { id: "code", label: "Code", shortcut: "Mod+E", icon: "</>" },
] as const;

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * CollaborativeEditor — rich text editor surface with Yjs CRDT integration.
 *
 * This component renders the editor UI, toolbar, collaborator avatars, and
 * connection status. The actual Tiptap + Yjs wiring is done at the app level
 * (using the CollabDraft client from collab-client.ts), and this component
 * receives the state via props. This keeps the UI package free of heavy
 * dependencies (Tiptap, Yjs) that are wired in apps/web.
 *
 * The editor surface uses a contentEditable div that the parent can bind
 * to a Tiptap editor instance via the ref.
 */
export const CollaborativeEditor = forwardRef<
  HTMLDivElement,
  CollaborativeEditorProps
>(function CollaborativeEditor(
  {
    collabConfig,
    connectionStatus = "idle",
    collaborators = [],
    currentUser: _currentUser,
    initialContent = "",
    placeholder = "Start writing your email...",
    readOnly = false,
    onChange,
    onConnectionChange: _onConnectionChange,
    onCollaboratorsChange: _onCollaboratorsChange,
    onOpenPanel,
    showToolbar = true,
    showCollaborators = true,
    minHeight = 200,
    className = "",
    ...props
  },
  ref,
) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [activeFormats, setActiveFormats] = useState<Set<string>>(
    new Set(),
  );
  const [isEmpty, setIsEmpty] = useState(!initialContent);

  // Merge refs so parent can access the editor DOM.
  const mergedRef = useCallback(
    (node: HTMLDivElement | null) => {
      (editorRef as React.MutableRefObject<HTMLDivElement | null>).current =
        node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        (ref as React.MutableRefObject<HTMLDivElement | null>).current =
          node;
      }
    },
    [ref],
  );

  // Track content changes on the contentEditable div.
  const handleInput = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const text = el.textContent ?? "";
    const html = el.innerHTML;
    setIsEmpty(text.trim().length === 0);
    onChange?.({ text, html });
  }, [onChange]);

  // Toolbar action handler.
  const handleToolbarAction = useCallback(
    (actionId: string) => {
      if (readOnly) return;
      // Execute browser's built-in rich text commands.
      // In the real wiring, Tiptap commands replace these.
      const commandMap: Record<string, string> = {
        bold: "bold",
        italic: "italic",
        underline: "underline",
        strikethrough: "strikeThrough",
        "bullet-list": "insertUnorderedList",
        "ordered-list": "insertOrderedList",
        code: "formatBlock",
      };
      const command = commandMap[actionId];
      if (command) {
        if (actionId === "code") {
          document.execCommand(command, false, "pre");
        } else if (actionId === "blockquote") {
          document.execCommand("formatBlock", false, "blockquote");
        } else {
          document.execCommand(command, false, undefined);
        }
      }

      // Update active formats.
      setActiveFormats((prev) => {
        const next = new Set(prev);
        if (next.has(actionId)) {
          next.delete(actionId);
        } else {
          next.add(actionId);
        }
        return next;
      });

      // Refocus editor.
      editorRef.current?.focus();
    },
    [readOnly],
  );

  // Keyboard shortcut handler.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (readOnly) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "b") {
        e.preventDefault();
        handleToolbarAction("bold");
      } else if (mod && e.key === "i") {
        e.preventDefault();
        handleToolbarAction("italic");
      } else if (mod && e.key === "u") {
        e.preventDefault();
        handleToolbarAction("underline");
      } else if (mod && e.key === "e") {
        e.preventDefault();
        handleToolbarAction("code");
      }
    },
    [readOnly, handleToolbarAction],
  );

  const statusInfo = statusDisplay[connectionStatus];
  const isCollaborative = collabConfig !== null;

  const collaboratorCount = collaborators.length;
  const onlineCollaborators = useMemo(
    () => collaborators.filter((c) => c.isOnline),
    [collaborators],
  );

  return (
    <Box
      className={`flex flex-col bg-surface-primary border border-border rounded-xl overflow-hidden ${className}`}
      {...props}
    >
      {/* Top bar: collaborators + connection status */}
      {isCollaborative && (
        <Box className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface-secondary">
          <Box className="flex items-center gap-3">
            {showCollaborators && collaboratorCount > 0 && (
              <CollaboratorAvatars
                collaborators={collaborators}
                size="sm"
                maxVisible={6}
                {...(onOpenPanel ? { onCollaboratorClick: () => onOpenPanel() } : {})}
              />
            )}

            {onlineCollaborators.length > 0 && (
              <Text variant="caption" className="text-content-secondary">
                {onlineCollaborators.length} editing
              </Text>
            )}
          </Box>

          <Box className="flex items-center gap-2">
            {/* Connection status */}
            <Box className="flex items-center gap-1.5">
              <Box
                className={`w-2 h-2 rounded-full ${statusInfo.dotClass}`}
                aria-hidden="true"
              />
              <Text variant="caption" className="text-content-secondary">
                {statusInfo.label}
              </Text>
            </Box>

            {onOpenPanel && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onOpenPanel}
                aria-label="Open collaboration panel"
              >
                <Box as="span" className="text-sm" aria-hidden="true">
                  {"\u2699"}
                </Box>
              </Button>
            )}
          </Box>
        </Box>
      )}

      {/* Toolbar */}
      {showToolbar && !readOnly && (
        <Box
          className="flex items-center gap-0.5 px-3 py-1.5 border-b border-border bg-surface-primary overflow-x-auto"
          role="toolbar"
          aria-label="Text formatting"
        >
          {toolbarActions.map((action) => (
            <Button
              key={action.id}
              variant="ghost"
              size="sm"
              onClick={() => handleToolbarAction(action.id)}
              aria-label={action.label}
              aria-pressed={activeFormats.has(action.id)}
              title={
                action.shortcut
                  ? `${action.label} (${action.shortcut})`
                  : action.label
              }
              className={`min-w-[32px] h-8 text-sm font-mono ${
                activeFormats.has(action.id)
                  ? "bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300"
                  : "text-content-secondary"
              }`}
            >
              {action.icon}
            </Button>
          ))}
        </Box>
      )}

      {/* Editor surface */}
      <Box className="relative flex-1" style={{ minHeight }}>
        <Box
          ref={mergedRef}
          className={`w-full h-full p-4 text-body-md text-content outline-none overflow-y-auto ${
            readOnly ? "cursor-default" : "cursor-text"
          }`}
          style={{ minHeight }}
          contentEditable={!readOnly}
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          role="textbox"
          aria-multiline="true"
          aria-label="Email body editor"
          aria-readonly={readOnly}
          data-placeholder={placeholder}
          dangerouslySetInnerHTML={
            initialContent ? { __html: initialContent } : undefined
          }
        />

        {/* Placeholder overlay */}
        {isEmpty && !readOnly && (
          <Box
            className="absolute top-4 left-4 pointer-events-none select-none"
            aria-hidden="true"
          >
            <Text variant="body-md" className="text-content-tertiary">
              {placeholder}
            </Text>
          </Box>
        )}

        {/* Remote cursor labels rendered as overlays.
            In the real Tiptap integration, y-prosemirror renders these
            natively. This is the fallback/demo for the component. */}
        {onlineCollaborators.length > 0 && (
          <Box
            className="absolute top-2 right-2 flex flex-col gap-1 pointer-events-none"
            aria-hidden="true"
          >
            {onlineCollaborators.map((c) => (
              <Box
                key={c.userId}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-white"
                style={{ backgroundColor: c.cursorColor }}
              >
                {c.name}
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {/* Status bar */}
      {isCollaborative && (
        <Box className="flex items-center justify-between px-4 py-1.5 border-t border-border bg-surface-secondary text-content-tertiary">
          <Text variant="caption">
            Session: {collabConfig.sessionId.slice(0, 8)}...
          </Text>
          <Text variant="caption">
            {readOnly ? "View only" : "Editing"}
            {collaboratorCount > 1
              ? ` with ${collaboratorCount - 1} other${collaboratorCount > 2 ? "s" : ""}`
              : ""}
          </Text>
        </Box>
      )}
    </Box>
  );
});

CollaborativeEditor.displayName = "CollaborativeEditor";
