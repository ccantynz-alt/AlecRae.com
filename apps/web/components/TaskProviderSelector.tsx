"use client";

/**
 * TaskProviderSelector — Dropdown to choose and configure task providers (S8).
 *
 * Shows a list of all supported task providers with connection status.
 * Users can:
 *   - See which providers are connected
 *   - Select a default provider
 *   - Navigate to provider configuration
 *
 * Used in settings and as a standalone selector in the task extraction flow.
 */

import type { ReactElement } from "react";
import { useState, useCallback, useEffect } from "react";
import { Box, Text, Button, Card, CardContent } from "@emailed/ui";
import { taskApi, type TaskProviderData } from "../lib/api";

// ─── Props ──────────────────────────────────────────────────────────────────

export interface TaskProviderSelectorProps {
  /** Called when user selects a provider. */
  onSelect: (providerName: string) => void;
  /** Currently selected provider. */
  selected?: string;
  /** Whether to show configuration options. */
  showConfig?: boolean;
  /** Extra Tailwind classes. */
  className?: string;
}

// ─── State ──────────────────────────────────────────────────────────────────

type LoadState = "loading" | "loaded" | "error";

// ─── Provider icons ─────────────────────────────────────────────────────────

const PROVIDER_ICONS: Record<string, { emoji: string; color: string }> = {
  builtin: { emoji: "", color: "bg-violet-500/20" },
  todoist: { emoji: "", color: "bg-red-500/20" },
  linear: { emoji: "", color: "bg-blue-500/20" },
  notion: { emoji: "", color: "bg-white/10" },
  things3: { emoji: "", color: "bg-sky-500/20" },
  apple_reminders: { emoji: "", color: "bg-orange-500/20" },
  microsoft_todo: { emoji: "", color: "bg-blue-600/20" },
};

// ─── Component ──────────────────────────────────────────────────────────────

export function TaskProviderSelector({
  onSelect,
  selected,
  showConfig = false,
  className,
}: TaskProviderSelectorProps): ReactElement {
  const [state, setState] = useState<LoadState>("loading");
  const [providers, setProviders] = useState<readonly TaskProviderData[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    void (async (): Promise<void> => {
      try {
        const res = await taskApi.listProviders();
        setProviders(res.data);
        setState("loaded");
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Failed to load providers");
        setState("error");
      }
    })();
  }, []);

  const handleSelect = useCallback(
    (name: string): void => {
      onSelect(name);
    },
    [onSelect],
  );

  return (
    <Box
      className={`space-y-3 ${className ?? ""}`}
      role="radiogroup"
      aria-label="Task provider selection"
    >
      <Box className="flex items-center gap-2">
        <Box className="w-2 h-2 rounded-full bg-violet-400" role="presentation" />
        <Text
          variant="body-sm"
          className="font-semibold text-violet-200 uppercase tracking-wider text-xs"
        >
          Task Providers
        </Text>
      </Box>

      {/* Loading */}
      {state === "loading" && (
        <Box className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Box key={i} className="h-12 rounded bg-white/5 animate-pulse" />
          ))}
        </Box>
      )}

      {/* Error */}
      {state === "error" && (
        <Card className="bg-red-950/30 border-red-500/20" padding="sm">
          <CardContent>
            <Text variant="body-sm" className="text-red-300 text-xs">
              {errorMsg}
            </Text>
          </CardContent>
        </Card>
      )}

      {/* Provider list */}
      {state === "loaded" && (
        <Box className="space-y-2">
          {providers.map((provider) => {
            const isSelected = provider.name === selected;
            const icon = PROVIDER_ICONS[provider.name] ?? { emoji: "", color: "bg-white/10" };

            return (
              <Card
                key={provider.name}
                className={`cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-violet-500/10 border-violet-500/30"
                    : "bg-white/5 border-white/10 hover:bg-white/8"
                }`}
                padding="sm"
                onClick={() => handleSelect(provider.name)}
                hoverable
              >
                <Box className="flex items-center justify-between">
                  <Box className="flex items-center gap-3">
                    {/* Icon */}
                    <Box className={`w-8 h-8 rounded-lg ${icon.color} flex items-center justify-center`}>
                      <Text variant="body-sm" className="text-sm">
                        {icon.emoji}
                      </Text>
                    </Box>
                    {/* Info */}
                    <Box>
                      <Box className="flex items-center gap-2">
                        <Text variant="body-sm" className="font-medium text-white text-sm">
                          {provider.displayName}
                        </Text>
                        {provider.isDefault && (
                          <Box className="px-1.5 py-0.5 rounded-full bg-violet-500/20">
                            <Text variant="body-sm" className="text-[10px] text-violet-300 uppercase tracking-wider">
                              Default
                            </Text>
                          </Box>
                        )}
                      </Box>
                      <Text variant="body-sm" className="text-white/40 text-xs">
                        {provider.description}
                      </Text>
                    </Box>
                  </Box>

                  {/* Connection status */}
                  <Box className="flex items-center gap-2">
                    {provider.connected ? (
                      <Box className="flex items-center gap-1">
                        <Box className="w-2 h-2 rounded-full bg-emerald-400" />
                        <Text variant="body-sm" className="text-xs text-emerald-400">
                          Connected
                        </Text>
                      </Box>
                    ) : (
                      <Box className="flex items-center gap-1">
                        <Box className="w-2 h-2 rounded-full bg-white/20" />
                        <Text variant="body-sm" className="text-xs text-white/30">
                          Not connected
                        </Text>
                      </Box>
                    )}

                    {showConfig && !provider.connected && provider.name !== "builtin" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          // Navigate to provider settings
                          // This would open a configuration modal in production
                        }}
                        aria-label={`Configure ${provider.displayName}`}
                      >
                        Configure
                      </Button>
                    )}

                    {/* Radio indicator */}
                    <Box
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                        isSelected
                          ? "border-violet-500 bg-violet-500"
                          : "border-white/20"
                      }`}
                      role="radio"
                      aria-checked={isSelected}
                      aria-label={`Select ${provider.displayName}`}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleSelect(provider.name);
                        }
                      }}
                    >
                      {isSelected && (
                        <Box className="w-2 h-2 rounded-full bg-white" />
                      )}
                    </Box>
                  </Box>
                </Box>
              </Card>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
