/**
 * AlecRae — Consent management (GDPR / ePrivacy / CCPA / CPRA / LGPD).
 *
 * This is the single source of truth for cookie and tracking-technology
 * consent. Every client surface that plans to set a non-essential cookie,
 * write to localStorage outside a session, or fire any analytic event
 * MUST first call `hasConsent(category)` — no exceptions.
 *
 * We treat "consent" as a first-class privacy control:
 *  - Strictly-necessary cookies always run (no consent required by law).
 *  - All other categories default to OFF (GDPR "opt-in by default").
 *  - Global Privacy Control (GPC) and Do Not Track (DNT) signals are
 *    respected automatically — if the browser sets either, we treat
 *    the non-essential categories as explicitly declined and suppress
 *    the banner.
 *  - Consent records include timestamp + version so we can prove
 *    affirmative, informed, revocable consent under Article 7 GDPR.
 */

export type ConsentCategory =
  | "necessary"
  | "functional"
  | "analytics"
  | "performance";

export interface ConsentRecord {
  /** Incremented whenever the cookie policy materially changes. */
  version: number;
  /** ISO-8601 timestamp of when the user recorded the decision. */
  decidedAt: string;
  /** Per-category state. `necessary` is always true. */
  categories: Record<ConsentCategory, boolean>;
  /** True if the decision was auto-applied because GPC/DNT was set. */
  autoAppliedFromSignal: boolean;
}

export const CONSENT_VERSION = 1;
export const CONSENT_STORAGE_KEY = "alecrae.consent.v1";
export const CONSENT_CHANGED_EVENT = "alecrae:consent-changed";

export const DEFAULT_CONSENT: ConsentRecord = {
  version: CONSENT_VERSION,
  decidedAt: "",
  categories: {
    necessary: true,
    functional: false,
    analytics: false,
    performance: false,
  },
  autoAppliedFromSignal: false,
};

/**
 * Detect a Global Privacy Control signal.
 * See https://globalprivacycontrol.org/. Respected by CPRA regulations
 * and a growing number of US state laws.
 */
export function detectGPCSignal(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.globalPrivacyControl === true;
}

/**
 * Detect a legacy Do Not Track signal. We honour it for compatibility
 * even though GPC is now the canonical mechanism.
 */
export function detectDNTSignal(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & {
    doNotTrack?: string;
    msDoNotTrack?: string;
  };
  const values = [nav.doNotTrack, nav.msDoNotTrack];
  if (typeof window !== "undefined") {
    const w = window as Window & { doNotTrack?: string };
    values.push(w.doNotTrack);
  }
  return values.some((v) => v === "1" || v === "yes");
}

export function loadConsent(): ConsentRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentRecord;
    if (typeof parsed !== "object" || parsed === null) return null;
    if (parsed.version !== CONSENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveConsent(record: ConsentRecord): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record));
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: record }));
  } catch {
    // Intentionally swallow — storage full / disabled must not break the site.
  }
}

export function resetConsent(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: null }));
  } catch {
    // Intentionally swallow.
  }
}

export function hasConsent(category: ConsentCategory): boolean {
  if (category === "necessary") return true;
  const record = loadConsent();
  if (!record) return false;
  return record.categories[category] === true;
}

export function buildConsentRecord(
  categories: Partial<Record<ConsentCategory, boolean>>,
  autoAppliedFromSignal = false,
): ConsentRecord {
  return {
    version: CONSENT_VERSION,
    decidedAt: new Date().toISOString(),
    autoAppliedFromSignal,
    categories: {
      necessary: true,
      functional: categories.functional ?? false,
      analytics: categories.analytics ?? false,
      performance: categories.performance ?? false,
    },
  };
}
