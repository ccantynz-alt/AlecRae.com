"use client";

import { useState, useCallback, useEffect } from "react";
import { Box, Text, Button, Card, CardContent } from "@alecrae/ui";

/* ───────────────────────────────────────────────────────────────────────────
 *  Types
 * ─────────────────────────────────────────────────────────────────────────── */

type OnboardingStep = 1 | 2 | 3;

type Density = "compact" | "comfortable" | "spacious";

interface ConnectedAccount {
  provider: "gmail" | "outlook" | "imap";
  label: string;
}

/* ───────────────────────────────────────────────────────────────────────────
 *  Constants
 * ─────────────────────────────────────────────────────────────────────────── */

const STEP_LABELS: Record<OnboardingStep, string> = {
  1: "Connect",
  2: "Personalize",
  3: "Ready",
};

const DENSITY_OPTIONS: Array<{
  value: Density;
  label: string;
  description: string;
  lineCount: number;
}> = [
  {
    value: "compact",
    label: "Compact",
    description: "More emails, less spacing",
    lineCount: 7,
  },
  {
    value: "comfortable",
    label: "Comfortable",
    description: "Balanced view",
    lineCount: 5,
  },
  {
    value: "spacious",
    label: "Spacious",
    description: "Relaxed, easy on the eyes",
    lineCount: 3,
  },
];

const API_BASE = "/v1/connect";

/* ───────────────────────────────────────────────────────────────────────────
 *  Main Page
 * ─────────────────────────────────────────────────────────────────────────── */

export default function OnboardingPage(): React.ReactElement {
  const [step, setStep] = useState<OnboardingStep>(1);
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([]);
  const [density, setDensity] = useState<Density>("comfortable");

  const handleConnect = useCallback((provider: ConnectedAccount["provider"], label: string): void => {
    setConnectedAccounts((prev) => {
      const exists = prev.some((a) => a.provider === provider);
      if (exists) return prev;
      return [...prev, { provider, label }];
    });
  }, []);

  const goNext = useCallback((): void => {
    setStep((prev) => {
      if (prev >= 3) return prev;
      return (prev + 1) as OnboardingStep;
    });
  }, []);

  const goBack = useCallback((): void => {
    setStep((prev) => {
      if (prev <= 1) return prev;
      return (prev - 1) as OnboardingStep;
    });
  }, []);

  return (
    <Box className="min-h-full flex flex-col items-center bg-[#f5f4ef] px-4 py-8 md:py-16 overflow-y-auto">
      {/* ── Brand ──────────────────────────────────────────────── */}
      <Box className="text-center mb-8">
        <Box
          as="span"
          className="text-4xl md:text-5xl text-neutral-900 select-none block"
          style={{
            fontFamily: "var(--font-italianno), cursive",
            fontWeight: 400,
          }}
        >
          AlecRae
        </Box>
        <Text variant="body-sm" muted className="mt-1">
          Email, Evolved.
        </Text>
      </Box>

      {/* ── Progress indicator ─────────────────────────────────── */}
      <ProgressBar currentStep={step} />

      {/* ── Step content ───────────────────────────────────────── */}
      <Box className="w-full max-w-2xl mt-8">
        {step === 1 && (
          <StepConnect
            connectedAccounts={connectedAccounts}
            onConnect={handleConnect}
            onSkip={goNext}
            onNext={goNext}
          />
        )}
        {step === 2 && (
          <StepPersonalize
            density={density}
            onDensityChange={setDensity}
            onBack={goBack}
            onNext={goNext}
          />
        )}
        {step === 3 && (
          <StepReady
            connectedAccounts={connectedAccounts}
            density={density}
          />
        )}
      </Box>
    </Box>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 *  Progress Bar
 * ─────────────────────────────────────────────────────────────────────────── */

function ProgressBar({ currentStep }: { currentStep: OnboardingStep }): React.ReactElement {
  const steps: OnboardingStep[] = [1, 2, 3];

  return (
    <Box
      className="flex items-center gap-3 md:gap-4"
      role="navigation"
      aria-label="Onboarding progress"
    >
      {steps.map((s, i) => {
        const isActive = s === currentStep;
        const isComplete = s < currentStep;
        return (
          <Box key={s} className="flex items-center gap-3 md:gap-4">
            {/* Step dot + label */}
            <Box className="flex items-center gap-2">
              <Box
                className={[
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
                  isActive
                    ? "bg-neutral-900 text-[#f5f4ef]"
                    : isComplete
                      ? "bg-neutral-700 text-[#f5f4ef]"
                      : "bg-neutral-300/60 text-neutral-500",
                ].join(" ")}
                aria-current={isActive ? "step" : undefined}
              >
                {isComplete ? (
                  <CheckIcon />
                ) : (
                  <Box as="span" style={{ fontFamily: "var(--font-inter), sans-serif" }}>
                    {s}
                  </Box>
                )}
              </Box>
              <Box
                as="span"
                className={[
                  "text-xs tracking-[0.12em] uppercase hidden sm:inline",
                  isActive ? "text-neutral-900 font-medium" : "text-neutral-500",
                ].join(" ")}
                style={{ fontFamily: "var(--font-inter), sans-serif" }}
              >
                {STEP_LABELS[s]}
              </Box>
            </Box>

            {/* Connector line (not after last) */}
            {i < steps.length - 1 && (
              <Box
                className={[
                  "w-8 md:w-16 h-px transition-colors",
                  s < currentStep ? "bg-neutral-700" : "bg-neutral-300/60",
                ].join(" ")}
                aria-hidden="true"
              />
            )}
          </Box>
        );
      })}
    </Box>
  );
}

ProgressBar.displayName = "ProgressBar";

/* ───────────────────────────────────────────────────────────────────────────
 *  Step 1: Connect Your Email
 * ─────────────────────────────────────────────────────────────────────────── */

interface StepConnectProps {
  connectedAccounts: ConnectedAccount[];
  onConnect: (provider: ConnectedAccount["provider"], label: string) => void;
  onSkip: () => void;
  onNext: () => void;
}

function StepConnect({
  connectedAccounts,
  onConnect,
  onSkip,
  onNext,
}: StepConnectProps): React.ReactElement {
  const [showImap, setShowImap] = useState(false);
  const [imapHost, setImapHost] = useState("");
  const [imapEmail, setImapEmail] = useState("");

  const hasAccounts = connectedAccounts.length > 0;

  const handleGmail = (): void => {
    // Redirect to OAuth flow
    window.location.href = `${API_BASE}/gmail`;
  };

  const handleOutlook = (): void => {
    // Redirect to OAuth flow
    window.location.href = `${API_BASE}/outlook`;
  };

  const handleImapSubmit = (): void => {
    if (!imapHost.trim() || !imapEmail.trim()) return;
    onConnect("imap", imapEmail.trim());
    setShowImap(false);
    setImapHost("");
    setImapEmail("");
  };

  // Check URL params for OAuth callback success
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const provider = params.get("connected");
    const email = params.get("email");
    if (provider === "gmail" && email) {
      onConnect("gmail", email);
      // Clean up URL
      window.history.replaceState({}, "", "/onboarding");
    } else if (provider === "outlook" && email) {
      onConnect("outlook", email);
      window.history.replaceState({}, "", "/onboarding");
    }
  }, [onConnect]);

  return (
    <Box className="space-y-6">
      <Box className="text-center">
        <Box
          as="h2"
          className="text-3xl md:text-4xl text-neutral-900 mb-2"
          style={{ fontFamily: "var(--font-italianno), cursive", fontWeight: 400 }}
        >
          Connect your email
        </Box>
        <Text variant="body-md" muted>
          Link your accounts to get started. You can always add more later.
        </Text>
      </Box>

      {/* Connected accounts list */}
      {connectedAccounts.length > 0 && (
        <Box className="space-y-2">
          {connectedAccounts.map((acct) => (
            <Box
              key={`${acct.provider}-${acct.label}`}
              className="flex items-center gap-3 p-3 rounded-xl bg-[#fafaf6] border border-neutral-300/50"
            >
              <Box className="w-8 h-8 rounded-full bg-neutral-900 text-[#f5f4ef] flex items-center justify-center">
                <CheckIcon />
              </Box>
              <Box className="flex-1 min-w-0">
                <Text variant="body-sm" className="font-medium capitalize">
                  {acct.provider === "imap" ? "IMAP" : acct.provider.charAt(0).toUpperCase() + acct.provider.slice(1)}
                </Text>
                <Text variant="caption" muted className="truncate block">
                  {acct.label}
                </Text>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {/* Provider buttons */}
      <Box className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Box
          as="button"
          className="group flex flex-col items-center gap-3 p-6 rounded-2xl border border-neutral-300/60 bg-[#fafaf6] hover:border-neutral-500 hover:shadow-md transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-2 focus:ring-offset-[#f5f4ef]"
          onClick={handleGmail}
          aria-label="Connect Gmail account"
          type="button"
        >
          <GmailIcon />
          <Box
            as="span"
            className="text-sm font-medium text-neutral-900 group-hover:text-neutral-700"
            style={{ fontFamily: "var(--font-inter), sans-serif" }}
          >
            Connect Gmail
          </Box>
          <Box
            as="span"
            className="text-xs text-neutral-500"
            style={{ fontFamily: "var(--font-inter), sans-serif" }}
          >
            Google OAuth
          </Box>
        </Box>

        <Box
          as="button"
          className="group flex flex-col items-center gap-3 p-6 rounded-2xl border border-neutral-300/60 bg-[#fafaf6] hover:border-neutral-500 hover:shadow-md transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-2 focus:ring-offset-[#f5f4ef]"
          onClick={handleOutlook}
          aria-label="Connect Outlook account"
          type="button"
        >
          <OutlookIcon />
          <Box
            as="span"
            className="text-sm font-medium text-neutral-900 group-hover:text-neutral-700"
            style={{ fontFamily: "var(--font-inter), sans-serif" }}
          >
            Connect Outlook
          </Box>
          <Box
            as="span"
            className="text-xs text-neutral-500"
            style={{ fontFamily: "var(--font-inter), sans-serif" }}
          >
            Microsoft OAuth
          </Box>
        </Box>
      </Box>

      {/* IMAP option */}
      {!showImap ? (
        <Box className="text-center">
          <Box
            as="button"
            className="text-xs tracking-[0.12em] uppercase text-neutral-500 hover:text-neutral-900 transition-colors cursor-pointer focus:outline-none focus:underline"
            onClick={() => setShowImap(true)}
            style={{ fontFamily: "var(--font-inter), sans-serif" }}
            type="button"
            aria-label="Connect via IMAP for other providers"
          >
            Connect via IMAP
          </Box>
        </Box>
      ) : (
        <Card>
          <CardContent>
            <Box className="space-y-4">
              <Text variant="body-sm" className="font-medium">
                Connect via IMAP
              </Text>
              <Box className="space-y-3">
                <Box>
                  <Box
                    as="label"
                    htmlFor="imap-email"
                    className="block text-xs font-medium text-neutral-700 mb-1"
                    style={{ fontFamily: "var(--font-inter), sans-serif" }}
                  >
                    Email address
                  </Box>
                  <Box
                    as="input"
                    id="imap-email"
                    type="email"
                    placeholder="you@provider.com"
                    autoComplete="email"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-300 bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent"
                    style={{ fontFamily: "var(--font-inter), sans-serif" }}
                    value={imapEmail}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setImapEmail(e.target.value)}
                  />
                </Box>
                <Box>
                  <Box
                    as="label"
                    htmlFor="imap-host"
                    className="block text-xs font-medium text-neutral-700 mb-1"
                    style={{ fontFamily: "var(--font-inter), sans-serif" }}
                  >
                    IMAP server
                  </Box>
                  <Box
                    as="input"
                    id="imap-host"
                    type="text"
                    placeholder="imap.provider.com"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-300 bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent"
                    style={{ fontFamily: "var(--font-inter), sans-serif" }}
                    value={imapHost}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setImapHost(e.target.value)}
                  />
                </Box>
                <Box className="flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleImapSubmit}
                    disabled={!imapHost.trim() || !imapEmail.trim()}
                  >
                    Connect
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowImap(false);
                      setImapHost("");
                      setImapEmail("");
                    }}
                  >
                    Cancel
                  </Button>
                </Box>
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <Box className="flex items-center justify-between pt-4 border-t border-neutral-300/50">
        <Box />
        <Box className="flex items-center gap-4">
          {!hasAccounts && (
            <Box
              as="button"
              className="text-xs tracking-[0.12em] uppercase text-neutral-500 hover:text-neutral-900 transition-colors cursor-pointer focus:outline-none focus:underline"
              onClick={onSkip}
              style={{ fontFamily: "var(--font-inter), sans-serif" }}
              type="button"
              aria-label="Skip connecting email accounts"
            >
              Skip for now
            </Box>
          )}
          {hasAccounts && (
            <Button variant="primary" size="lg" onClick={onNext}>
              Continue
            </Button>
          )}
        </Box>
      </Box>
    </Box>
  );
}

StepConnect.displayName = "StepConnect";

/* ───────────────────────────────────────────────────────────────────────────
 *  Step 2: Personalize
 * ─────────────────────────────────────────────────────────────────────────── */

interface StepPersonalizeProps {
  density: Density;
  onDensityChange: (d: Density) => void;
  onBack: () => void;
  onNext: () => void;
}

function StepPersonalize({
  density,
  onDensityChange,
  onBack,
  onNext,
}: StepPersonalizeProps): React.ReactElement {
  return (
    <Box className="space-y-6">
      <Box className="text-center">
        <Box
          as="h2"
          className="text-3xl md:text-4xl text-neutral-900 mb-2"
          style={{ fontFamily: "var(--font-italianno), cursive", fontWeight: 400 }}
        >
          Personalize your inbox
        </Box>
        <Text variant="body-md" muted>
          Choose how your inbox looks. You can change this anytime in Settings.
        </Text>
      </Box>

      {/* Theme note */}
      <Box className="text-center">
        <Text variant="caption" muted>
          Theme: Light
        </Text>
      </Box>

      {/* Density selector */}
      <Box>
        <Text
          variant="body-sm"
          className="font-medium mb-3 block"
          style={{ fontFamily: "var(--font-inter), sans-serif" }}
        >
          Display density
        </Text>
        <Box
          className="grid grid-cols-1 sm:grid-cols-3 gap-4"
          role="radiogroup"
          aria-label="Display density"
        >
          {DENSITY_OPTIONS.map((option) => {
            const isSelected = density === option.value;
            return (
              <Box
                key={option.value}
                as="button"
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={`${option.label} density: ${option.description}`}
                className={[
                  "flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all cursor-pointer",
                  "focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-2 focus:ring-offset-[#f5f4ef]",
                  isSelected
                    ? "border-neutral-900 bg-[#fafaf6] shadow-md"
                    : "border-neutral-300/60 bg-[#fafaf6] hover:border-neutral-400",
                ].join(" ")}
                onClick={() => onDensityChange(option.value)}
              >
                {/* Visual preview */}
                <DensityPreview lineCount={option.lineCount} isSelected={isSelected} />

                <Box className="text-center">
                  <Box
                    as="span"
                    className={[
                      "text-sm font-medium block",
                      isSelected ? "text-neutral-900" : "text-neutral-700",
                    ].join(" ")}
                    style={{ fontFamily: "var(--font-inter), sans-serif" }}
                  >
                    {option.label}
                  </Box>
                  <Box
                    as="span"
                    className="text-xs text-neutral-500 block mt-0.5"
                    style={{ fontFamily: "var(--font-inter), sans-serif" }}
                  >
                    {option.description}
                  </Box>
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Navigation */}
      <Box className="flex items-center justify-between pt-4 border-t border-neutral-300/50">
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
        <Button variant="primary" size="lg" onClick={onNext}>
          Continue
        </Button>
      </Box>
    </Box>
  );
}

StepPersonalize.displayName = "StepPersonalize";

/* ───────────────────────────────────────────────────────────────────────────
 *  Step 3: You're Ready
 * ─────────────────────────────────────────────────────────────────────────── */

interface StepReadyProps {
  connectedAccounts: ConnectedAccount[];
  density: Density;
}

function StepReady({
  connectedAccounts,
  density,
}: StepReadyProps): React.ReactElement {
  const [progress, setProgress] = useState(0);

  // Simulate sync progress
  useEffect(() => {
    if (connectedAccounts.length === 0) {
      setProgress(100);
      return;
    }

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        // Accelerate near the start, slow down near the end
        const increment = prev < 60 ? 4 : prev < 85 ? 2 : 1;
        return Math.min(prev + increment, 100);
      });
    }, 120);

    return () => clearInterval(interval);
  }, [connectedAccounts.length]);

  const syncComplete = progress >= 100;

  return (
    <Box className="space-y-8 text-center">
      <Box>
        <Box
          as="h2"
          className="text-4xl md:text-5xl text-neutral-900 mb-2"
          style={{ fontFamily: "var(--font-italianno), cursive", fontWeight: 400 }}
        >
          {syncComplete ? "You’re ready" : "Setting things up"}
        </Box>
        <Text variant="body-md" muted>
          {connectedAccounts.length > 0
            ? syncComplete
              ? "Your inbox is synced and ready to go."
              : "Your inbox is syncing. This won’t take long."
            : "You can connect email accounts anytime from Settings."}
        </Text>
      </Box>

      {/* Sync progress */}
      {connectedAccounts.length > 0 && (
        <Box className="max-w-sm mx-auto space-y-3">
          {/* Progress bar */}
          <Box
            className="w-full h-2 rounded-full bg-neutral-200 overflow-hidden"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Inbox sync progress"
          >
            <Box
              className="h-full rounded-full bg-neutral-900 transition-all duration-300 ease-out"
              style={{ width: `${String(progress)}%` }}
            />
          </Box>
          <Text variant="caption" muted>
            {syncComplete ? "Sync complete" : `Syncing… ${String(progress)}%`}
          </Text>
        </Box>
      )}

      {/* Summary */}
      <Card>
        <CardContent>
          <Box className="space-y-4 text-left">
            <Text variant="body-sm" className="font-medium">
              Setup summary
            </Text>

            {/* Accounts */}
            <Box className="flex items-start gap-3">
              <Box className="w-6 h-6 rounded-full bg-neutral-900 text-[#f5f4ef] flex items-center justify-center flex-shrink-0 mt-0.5">
                {connectedAccounts.length > 0 ? (
                  <CheckIcon />
                ) : (
                  <Box as="span" className="text-xs" style={{ fontFamily: "var(--font-inter), sans-serif" }}>
                    --
                  </Box>
                )}
              </Box>
              <Box>
                <Text variant="body-sm" className="font-medium">
                  Email accounts
                </Text>
                {connectedAccounts.length > 0 ? (
                  <Box className="mt-1 space-y-0.5">
                    {connectedAccounts.map((acct) => (
                      <Text key={`${acct.provider}-${acct.label}`} variant="caption" muted>
                        {acct.provider === "imap" ? "IMAP" : acct.provider.charAt(0).toUpperCase() + acct.provider.slice(1)}: {acct.label}
                      </Text>
                    ))}
                  </Box>
                ) : (
                  <Text variant="caption" muted>
                    No accounts connected yet
                  </Text>
                )}
              </Box>
            </Box>

            {/* Density */}
            <Box className="flex items-start gap-3">
              <Box className="w-6 h-6 rounded-full bg-neutral-900 text-[#f5f4ef] flex items-center justify-center flex-shrink-0 mt-0.5">
                <CheckIcon />
              </Box>
              <Box>
                <Text variant="body-sm" className="font-medium">
                  Display density
                </Text>
                <Text variant="caption" muted className="capitalize">
                  {density}
                </Text>
              </Box>
            </Box>

            {/* Theme */}
            <Box className="flex items-start gap-3">
              <Box className="w-6 h-6 rounded-full bg-neutral-900 text-[#f5f4ef] flex items-center justify-center flex-shrink-0 mt-0.5">
                <CheckIcon />
              </Box>
              <Box>
                <Text variant="body-sm" className="font-medium">
                  Theme
                </Text>
                <Text variant="caption" muted>
                  Light
                </Text>
              </Box>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* CTA */}
      <Box className="pt-2">
        <Box
          as="a"
          href="/inbox"
          className="inline-block px-10 py-4 bg-neutral-900 text-[#f5f4ef] rounded-full text-sm tracking-[0.12em] uppercase hover:bg-neutral-800 transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-2 focus:ring-offset-[#f5f4ef]"
          style={{ fontFamily: "var(--font-inter), sans-serif" }}
          aria-label="Go to your inbox"
        >
          Go to Inbox
        </Box>
      </Box>
    </Box>
  );
}

StepReady.displayName = "StepReady";

/* ───────────────────────────────────────────────────────────────────────────
 *  Density Preview Component
 * ─────────────────────────────────────────────────────────────────────────── */

function DensityPreview({
  lineCount,
  isSelected,
}: {
  lineCount: number;
  isSelected: boolean;
}): React.ReactElement {
  const lines = Array.from({ length: lineCount }, (_, i) => i);
  const gap = lineCount >= 7 ? "gap-1" : lineCount >= 5 ? "gap-1.5" : "gap-2.5";

  return (
    <Box
      className={[
        "w-full h-24 rounded-lg border p-3 flex flex-col justify-center",
        gap,
        isSelected ? "border-neutral-400 bg-white" : "border-neutral-200 bg-white/60",
      ].join(" ")}
      aria-hidden="true"
    >
      {lines.map((i) => (
        <Box key={i} className="flex items-center gap-2">
          <Box className="w-2 h-2 rounded-full bg-neutral-300 flex-shrink-0" />
          <Box
            className={[
              "h-1.5 rounded-full",
              i % 3 === 0 ? "w-3/4" : i % 3 === 1 ? "w-1/2" : "w-2/3",
              isSelected ? "bg-neutral-400" : "bg-neutral-300",
            ].join(" ")}
          />
        </Box>
      ))}
    </Box>
  );
}

DensityPreview.displayName = "DensityPreview";

/* ───────────────────────────────────────────────────────────────────────────
 *  Icons (inline SVG components — no external deps)
 * ─────────────────────────────────────────────────────────────────────────── */

function CheckIcon(): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M3 7.5L5.5 10L11 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

CheckIcon.displayName = "CheckIcon";

function GmailIcon(): React.ReactElement {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="4" y="8" width="32" height="24" rx="3" stroke="#EA4335" strokeWidth="2" fill="none" />
      <path d="M4 11L20 23L36 11" stroke="#EA4335" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

GmailIcon.displayName = "GmailIcon";

function OutlookIcon(): React.ReactElement {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="4" y="8" width="32" height="24" rx="3" stroke="#0078D4" strokeWidth="2" fill="none" />
      <path d="M4 11L20 23L36 11" stroke="#0078D4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

OutlookIcon.displayName = "OutlookIcon";
