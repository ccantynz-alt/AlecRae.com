"use client";

import { useState, useCallback } from "react";
import { Box, Text, Button } from "@alecrae/ui";
import {
  recallApi,
  type EnableRecallResult,
  type RecallStatusResult,
} from "../lib/api-compose-power";

interface ComposeRecallPanelProps {
  /** The id of the just-sent email (from messagesApi.send). */
  readonly emailId: string;
  readonly className?: string;
}

/**
 * Email recall surface — shown after a send succeeds. Lets the sender convert
 * the message to a revocable link, revoke access, set a self-destruct timer,
 * and view recall status (view count, last viewed, revoked/expired state).
 *
 * Wires:
 *   POST /v1/recall/enable
 *   POST /v1/recall/revoke/:id
 *   GET  /v1/recall/status/:id
 *   POST /v1/recall/self-destruct
 */
export function ComposeRecallPanel({
  emailId,
  className = "",
}: ComposeRecallPanelProps): React.JSX.Element {
  const [recall, setRecall] = useState<EnableRecallResult | null>(null);
  const [status, setStatus] = useState<RecallStatusResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [destructMinutes, setDestructMinutes] = useState<string>("60");
  const [copied, setCopied] = useState<boolean>(false);

  const refreshStatus = useCallback(async (): Promise<void> => {
    try {
      const res = await recallApi.status(emailId);
      setStatus(res.data);
    } catch {
      /* status is best-effort */
    }
  }, [emailId]);

  const handleEnable = useCallback(async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const res = await recallApi.enable(emailId);
      setRecall(res.data);
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enable recall");
    } finally {
      setBusy(false);
    }
  }, [emailId, refreshStatus]);

  const handleRevoke = useCallback(async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await recallApi.revoke(emailId);
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke access");
    } finally {
      setBusy(false);
    }
  }, [emailId, refreshStatus]);

  const handleSelfDestruct = useCallback(async (): Promise<void> => {
    const minutes = Number.parseInt(destructMinutes, 10);
    if (!Number.isFinite(minutes) || minutes < 1) {
      setError("Enter a valid number of minutes (1 or more).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await recallApi.selfDestruct(emailId, minutes);
      await refreshStatus();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to set self-destruct",
      );
    } finally {
      setBusy(false);
    }
  }, [emailId, destructMinutes, refreshStatus]);

  const handleCopy = useCallback(async (): Promise<void> => {
    if (!recall) return;
    try {
      await navigator.clipboard.writeText(recall.viewUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be unavailable — ignore */
    }
  }, [recall]);

  const isRevoked = status?.status === "revoked";
  const isExpired = status?.status === "expired";

  return (
    <Box
      className={`rounded-lg border border-border bg-surface-secondary p-3 ${className}`}
    >
      <Box className="flex items-center justify-between gap-3 flex-wrap">
        <Box className="flex items-center gap-2">
          <Text variant="body-sm" className="font-medium">
            Recall this email
          </Text>
          <Text variant="caption" muted>
            Serve via a revocable link you can pull back anytime
          </Text>
        </Box>
        {!recall && (
          <Button
            variant="primary"
            size="sm"
            loading={busy}
            disabled={busy}
            onClick={() => void handleEnable()}
          >
            Enable recall
          </Button>
        )}
      </Box>

      {error && (
        <Text variant="caption" className="text-status-error mt-2">
          {error}
        </Text>
      )}

      {recall && (
        <Box className="mt-3 space-y-3">
          {/* Status line */}
          <Box className="flex items-center gap-2 flex-wrap">
            <span
              className={`w-2 h-2 rounded-full inline-block ${
                isRevoked
                  ? "bg-status-error"
                  : isExpired
                    ? "bg-amber-500"
                    : "bg-green-500"
              }`}
              aria-hidden="true"
            />
            <Text variant="caption" muted>
              {isRevoked
                ? "Revoked — recipients can no longer view this email"
                : isExpired
                  ? "Expired — self-destruct timer elapsed"
                  : "Active"}
              {status ? ` · ${status.viewCount} view${status.viewCount === 1 ? "" : "s"}` : ""}
              {status?.selfDestructAt && !isRevoked
                ? ` · self-destructs ${new Date(status.selfDestructAt).toLocaleString()}`
                : ""}
            </Text>
          </Box>

          {/* Share link */}
          <Box className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={recall.viewUrl}
              aria-label="Recall view link"
              className="flex-1 h-8 px-2 rounded-md border border-border bg-surface text-content text-body-sm font-mono"
            />
            <Button variant="secondary" size="sm" onClick={() => void handleCopy()}>
              {copied ? "Copied" : "Copy link"}
            </Button>
          </Box>

          {/* Actions */}
          {!isRevoked && (
            <Box className="flex items-center gap-2 flex-wrap">
              <Box className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  value={destructMinutes}
                  onChange={(e) => setDestructMinutes(e.target.value)}
                  aria-label="Self-destruct in minutes"
                  className="w-20 h-8 px-2 rounded-md border border-border bg-surface text-content text-body-sm"
                />
                <Text variant="caption" muted>
                  min
                </Text>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={busy}
                  disabled={busy}
                  onClick={() => void handleSelfDestruct()}
                >
                  Set self-destruct
                </Button>
              </Box>
              <Button
                variant="destructive"
                size="sm"
                loading={busy}
                disabled={busy}
                onClick={() => void handleRevoke()}
              >
                Revoke now
              </Button>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
