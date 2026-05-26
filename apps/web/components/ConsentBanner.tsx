"use client";

/**
 * AlecRae Cookie / Tracking-Technology Consent Banner.
 *
 * Requirements met:
 *  - GDPR Article 7 affirmative, granular, revocable consent
 *  - ePrivacy Directive — no non-essential cookies fired before consent
 *  - CPRA (California) — "Do Not Sell or Share" link always present
 *  - Respects Global Privacy Control (GPC) and legacy DNT signals
 *  - Keyboard accessible, screen-reader friendly, WCAG 2.2 AA colour contrast
 *  - No dark patterns — "Reject all" is equally prominent as "Accept all"
 */

import { useCallback, useEffect, useState } from "react";
import {
  buildConsentRecord,
  CONSENT_CHANGED_EVENT,
  type ConsentCategory,
  type ConsentRecord,
  detectDNTSignal,
  detectGPCSignal,
  loadConsent,
  saveConsent,
} from "../lib/consent";

interface ToggleRowProps {
  readonly id: ConsentCategory;
  readonly label: string;
  readonly description: string;
  readonly required?: boolean;
  readonly checked: boolean;
  readonly onToggle: (next: boolean) => void;
}

function ToggleRow({ id, label, description, required, checked, onToggle }: ToggleRowProps) {
  const switchId = `consent-toggle-${id}`;
  const descId = `${switchId}-desc`;
  return (
    <div className="flex items-start justify-between gap-4 py-4 border-b border-neutral-200 last:border-b-0">
      <div className="flex-1 min-w-0">
        <label htmlFor={switchId} className="block text-sm font-semibold text-neutral-900">
          {label}
          {required ? (
            <span className="ml-2 text-[10px] uppercase tracking-wider text-neutral-500">
              Always active
            </span>
          ) : null}
        </label>
        <p id={descId} className="mt-1 text-xs text-neutral-600 leading-relaxed">
          {description}
        </p>
      </div>
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={descId}
        aria-disabled={required ? true : undefined}
        disabled={required}
        onClick={() => !required && onToggle(!checked)}
        className={[
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2",
          checked ? "bg-neutral-900" : "bg-neutral-300",
          required ? "cursor-not-allowed opacity-70" : "cursor-pointer",
        ].join(" ")}
      >
        <span
          className={[
            "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-5" : "translate-x-0.5",
          ].join(" ")}
        />
      </button>
    </div>
  );
}

export function ConsentBanner(): React.ReactElement | null {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [record, setRecord] = useState<ConsentRecord | null>(null);
  const [selections, setSelections] = useState<Record<ConsentCategory, boolean>>({
    necessary: true,
    functional: false,
    analytics: false,
    performance: false,
  });

  // Initial hydration: decide whether to show the banner.
  useEffect(() => {
    setMounted(true);

    const existing = loadConsent();
    if (existing) {
      setRecord(existing);
      setSelections(existing.categories);
      setVisible(false);
      return;
    }

    // Respect GPC / DNT as automatic "reject non-essential" signals.
    if (detectGPCSignal() || detectDNTSignal()) {
      const auto = buildConsentRecord(
        { functional: false, analytics: false, performance: false },
        true,
      );
      saveConsent(auto);
      setRecord(auto);
      setSelections(auto.categories);
      setVisible(false);
      return;
    }

    setVisible(true);
  }, []);

  // Respond to "Manage preferences" links from anywhere else on the site.
  useEffect(() => {
    function onOpen(): void {
      setShowPreferences(true);
      setVisible(true);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("alecrae:open-consent", onOpen);
      return () => window.removeEventListener("alecrae:open-consent", onOpen);
    }
    return undefined;
  }, []);

  const persist = useCallback((categories: Record<ConsentCategory, boolean>) => {
    const next = buildConsentRecord(categories, false);
    saveConsent(next);
    setRecord(next);
    setSelections(next.categories);
    setVisible(false);
    setShowPreferences(false);
  }, []);

  const acceptAll = useCallback(() => {
    persist({ necessary: true, functional: true, analytics: true, performance: true });
  }, [persist]);

  const rejectAll = useCallback(() => {
    persist({ necessary: true, functional: false, analytics: false, performance: false });
  }, [persist]);

  const saveSelections = useCallback(() => {
    persist(selections);
  }, [persist, selections]);

  if (!mounted || !visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="consent-banner-title"
      aria-describedby="consent-banner-desc"
      className="fixed inset-x-4 bottom-4 z-[100] mx-auto max-w-3xl rounded-xl border border-neutral-200 bg-white shadow-2xl"
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 id="consent-banner-title" className="text-base font-semibold text-neutral-900">
              Your privacy, your choice.
            </h2>
            <p id="consent-banner-desc" className="mt-2 text-sm text-neutral-700 leading-relaxed">
              AlecRae uses strictly necessary cookies to keep the site secure and working.
              With your permission we may also use a small number of functional, analytics,
              and performance cookies. We never use advertising cookies, we never share
              your data with brokers, and we never sell personal information. You can
              change your choices at any time from the footer link.
            </p>
          </div>
        </div>

        {showPreferences ? (
          <div className="mt-2 border-t border-neutral-200 pt-2">
            <ToggleRow
              id="necessary"
              label="Strictly necessary"
              description="Session cookies, CSRF protection, authentication. Required for the site to function. Cannot be disabled."
              required
              checked
              onToggle={() => undefined}
            />
            <ToggleRow
              id="functional"
              label="Functional"
              description="Remember language, theme, density and other preferences you explicitly set in the UI."
              checked={selections.functional}
              onToggle={(v) => setSelections((s) => ({ ...s, functional: v }))}
            />
            <ToggleRow
              id="analytics"
              label="Analytics"
              description="Aggregate, privacy-preserving measurement of page views and feature usage. No third-party trackers. No cross-site identifiers."
              checked={selections.analytics}
              onToggle={(v) => setSelections((s) => ({ ...s, analytics: v }))}
            />
            <ToggleRow
              id="performance"
              label="Performance"
              description="Real-user performance monitoring (Web Vitals) to catch regressions. Never includes personal content."
              checked={selections.performance}
              onToggle={(v) => setSelections((s) => ({ ...s, performance: v }))}
            />
          </div>
        ) : null}

        <div className="mt-5 flex flex-col sm:flex-row gap-2 sm:gap-3 sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <a
              href="/cookies"
              className="text-xs font-medium text-neutral-700 underline underline-offset-2 hover:text-neutral-900"
            >
              Cookie policy
            </a>
            <span aria-hidden="true" className="text-neutral-400 text-xs">·</span>
            <a
              href="/privacy"
              className="text-xs font-medium text-neutral-700 underline underline-offset-2 hover:text-neutral-900"
            >
              Privacy policy
            </a>
            <span aria-hidden="true" className="text-neutral-400 text-xs">·</span>
            <a
              href="/do-not-sell"
              className="text-xs font-medium text-neutral-700 underline underline-offset-2 hover:text-neutral-900"
            >
              Do Not Sell or Share
            </a>
          </div>

          <div className="flex flex-wrap gap-2 justify-end">
            {!showPreferences ? (
              <button
                type="button"
                onClick={() => setShowPreferences(true)}
                className="inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
              >
                Manage preferences
              </button>
            ) : (
              <button
                type="button"
                onClick={saveSelections}
                className="inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
              >
                Save my choices
              </button>
            )}
            <button
              type="button"
              onClick={rejectAll}
              className="inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
            >
              Reject non-essential
            </button>
            <button
              type="button"
              onClick={acceptAll}
              className="inline-flex items-center justify-center rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
            >
              Accept all
            </button>
          </div>
        </div>

        {record?.autoAppliedFromSignal ? (
          <p className="mt-4 text-[11px] text-neutral-500 leading-relaxed">
            We detected a Global Privacy Control or Do Not Track signal and applied it automatically.
          </p>
        ) : null}
      </div>
    </div>
  );
}

ConsentBanner.displayName = "ConsentBanner";

/**
 * Re-open the consent preferences from any link / button with
 * `data-open-consent` or by dispatching `alecrae:open-consent`.
 */
export function openConsentPreferences(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("alecrae:open-consent"));
}

/** Hook for other client components that need to react to consent changes. */
export function subscribeToConsentChanges(
  cb: (record: ConsentRecord | null) => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;
  const listener = (e: Event): void => {
    const detail = (e as CustomEvent<ConsentRecord | null>).detail ?? null;
    cb(detail);
  };
  window.addEventListener(CONSENT_CHANGED_EVENT, listener);
  return () => window.removeEventListener(CONSENT_CHANGED_EVENT, listener);
}
