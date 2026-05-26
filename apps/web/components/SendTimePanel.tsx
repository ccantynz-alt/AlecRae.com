"use client";

/**
 * SendTimePanel — Compose-integrated panel for S10 (Predictive Send-Time
 * Optimization).
 *
 * Fetches optimal send-time predictions from the API for the current
 * recipient(s), renders the SendTimeSuggestion UI component, and fires
 * callbacks when the user picks a time or dismisses the panel.
 *
 * Usage:
 *   <SendTimePanel
 *     recipientEmail="alice@example.com"
 *     onScheduleAt={(isoDatetime) => { ... }}
 *     onSendNow={() => { ... }}
 *   />
 */

import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import {
  SendTimeSuggestion,
  type SendTimeSlot,
  type ConfidenceLevel,
  type DataSource,
} from "@alecrae/ui";
import { sendTimeApi, type SendTimeRecommendation } from "../lib/api";

// ─── Props ─────────────────────────────────────────────────────────────────

export interface SendTimePanelProps {
  /** Primary recipient email to analyse. Empty string hides the panel. */
  recipientEmail: string;
  /** Called when user picks a specific future time slot. */
  onScheduleAt: (datetime: string, reasoning: string) => void;
  /** Called when user opts to send immediately (currentlyOptimal=true). */
  onSendNow?: () => void;
  /** Extra Tailwind classes. */
  className?: string;
}

// ─── State types ───────────────────────────────────────────────────────────

interface PanelState {
  loading: boolean;
  visible: boolean;
  recommendation: SendTimeRecommendation | null;
  error: string | null;
}

const INITIAL_STATE: PanelState = {
  loading: false,
  visible: false,
  recommendation: null,
  error: null,
};

// ─── Component ─────────────────────────────────────────────────────────────

export function SendTimePanel({
  recipientEmail,
  onScheduleAt,
  onSendNow,
  className = "",
}: SendTimePanelProps): React.ReactElement | null {
  const [state, setState] = useState<PanelState>(INITIAL_STATE);

  // Detect email validity
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim());

  const fetchPrediction = useCallback(async (): Promise<void> => {
    if (!isValidEmail) return;

    setState((prev) => ({ ...prev, loading: true, error: null, visible: true }));

    try {
      const senderTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await sendTimeApi.predict({
        recipientEmail: recipientEmail.trim(),
        senderTimezone,
      });

      setState({
        loading: false,
        visible: true,
        recommendation: res.data,
        error: null,
      });
    } catch (err) {
      setState({
        loading: false,
        visible: true,
        recommendation: null,
        error: err instanceof Error ? err.message : "Failed to fetch prediction",
      });
    }
  }, [recipientEmail, isValidEmail]);

  // Auto-fetch when recipientEmail changes (debounced 800ms after typing)
  useEffect(() => {
    if (!isValidEmail) {
      setState(INITIAL_STATE);
      return;
    }

    const timer = setTimeout(() => {
      void fetchPrediction();
    }, 800);

    return () => clearTimeout(timer);
  }, [recipientEmail, isValidEmail, fetchPrediction]);

  const handleSelectTime = useCallback(
    (slot: SendTimeSlot): void => {
      onScheduleAt(slot.datetime, slot.reasoning);
    },
    [onScheduleAt],
  );

  const handleDismiss = useCallback((): void => {
    setState((prev) => ({ ...prev, visible: false }));
  }, []);

  const handleRefresh = useCallback((): void => {
    void fetchPrediction();
  }, [fetchPrediction]);

  // Don't render anything if no valid email or panel dismissed
  if (!isValidEmail || !state.visible) return null;

  // Error state
  if (state.error && !state.loading) {
    return null; // Silently hide on error (AI fallback rule: graceful)
  }

  const rec = state.recommendation;

  const recommendedTimes: SendTimeSlot[] = rec?.recommendedTimes ?? [];
  const currentlyOptimal = rec?.currentlyOptimal ?? false;
  const dataSource: DataSource = rec?.dataSource ?? "default";
  const confidenceLevel: ConfidenceLevel =
    rec?.recipientPattern?.confidenceLevel ?? "none";
  const sampleSize = rec?.recipientPattern?.sampleSize ?? 0;

  return (
    <SendTimeSuggestion
      visible={state.visible}
      loading={state.loading}
      recommendedTimes={recommendedTimes}
      currentlyOptimal={currentlyOptimal}
      dataSource={dataSource}
      confidenceLevel={confidenceLevel}
      sampleSize={sampleSize}
      onSelectTime={handleSelectTime}
      onDismiss={handleDismiss}
      {...(onSendNow !== undefined ? { onSendNow } : {})}
      onRefresh={handleRefresh}
      className={className}
    />
  );
}
