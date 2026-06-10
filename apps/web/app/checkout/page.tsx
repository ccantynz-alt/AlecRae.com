"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getApiBase } from "../../lib/api-base";

// ─── Types ─────────────────────────────────────────────────────────────────

type PlanId = "starter" | "professional" | "enterprise";

const VALID_PLANS: readonly PlanId[] = ["starter", "professional", "enterprise"] as const;

function isPlanId(value: string): value is PlanId {
  return (VALID_PLANS as readonly string[]).includes(value);
}

const PLAN_LABELS: Record<PlanId, string> = {
  starter: "Personal",
  professional: "Pro",
  enterprise: "Team",
};

// ─── API ───────────────────────────────────────────────────────────────────

const API_BASE = getApiBase();

function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("alecrae_api_key") ?? "";
}

async function createCheckoutSession(planId: PlanId): Promise<string> {
  const token = getToken();
  const origin = window.location.origin;

  const res = await fetch(`${API_BASE}/v1/billing/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      planId,
      successUrl: `${origin}/billing?checkout=success`,
      cancelUrl: `${origin}/billing?checkout=cancelled`,
    }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(body?.error?.message ?? `Checkout failed: ${res.status}`);
  }

  const data = (await res.json()) as {
    data: { sessionId: string; url: string | null };
  };

  if (!data.data.url) {
    throw new Error("No checkout URL returned. Please try again.");
  }

  return data.data.url;
}

// ─── Spinner ───────────────────────────────────────────────────────────────

function Spinner(): React.ReactNode {
  return (
    <svg
      className="animate-spin h-8 w-8 text-blue-400"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

function CheckoutContent(): React.ReactNode {
  const searchParams = useSearchParams();
  const planParam = searchParams.get("plan") ?? "";

  const [status, setStatus] = useState<"loading" | "redirecting" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isPlanId(planParam)) {
      setErrorMessage(
        planParam
          ? `Unknown plan "${planParam}". Valid plans are: Personal, Pro, and Team.`
          : "No plan specified. Please select a plan from the pricing page.",
      );
      setStatus("error");
      return;
    }

    let cancelled = false;

    const run = async (): Promise<void> => {
      try {
        const url = await createCheckoutSession(planParam);
        if (!cancelled) {
          setStatus("redirecting");
          window.location.href = url;
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(
            err instanceof Error
              ? err.message
              : "Something went wrong. Please try again.",
          );
          setStatus("error");
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [planParam]);

  const planLabel = isPlanId(planParam) ? PLAN_LABELS[planParam] : null;

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-6">
      <div className="max-w-sm w-full text-center space-y-6">
        {/* AlecRae wordmark */}
        <p className="text-blue-400 font-bold text-lg tracking-tight">AlecRae</p>

        {status === "loading" || status === "redirecting" ? (
          <>
            <div className="flex justify-center">
              <Spinner />
            </div>
            <div className="space-y-1">
              <p className="text-white font-semibold text-lg">
                {status === "redirecting"
                  ? "Redirecting to Stripe..."
                  : planLabel
                    ? `Setting up ${planLabel} checkout...`
                    : "Preparing checkout..."}
              </p>
              <p className="text-slate-400 text-sm">
                You&apos;ll be redirected to our secure payment partner momentarily.
              </p>
            </div>
          </>
        ) : (
          <>
            {/* Error icon */}
            <div className="flex justify-center">
              <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-red-400"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-white font-semibold text-lg">Checkout unavailable</p>
              <p className="text-slate-400 text-sm">{errorMessage}</p>
            </div>

            <div className="flex flex-col gap-3">
              <a
                href="/billing"
                className="block w-full py-2.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors text-center"
              >
                View billing page
              </a>
              <a
                href="/#pricing"
                className="block w-full py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors border border-white/10 text-center"
              >
                Back to pricing
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function CheckoutPage(): React.ReactNode {
  // useSearchParams requires a Suspense boundary for static export (Next 15).
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center px-6">
          <div className="max-w-sm w-full text-center">
            <p className="text-blue-400 font-bold text-lg tracking-tight">AlecRae</p>
            <p className="text-slate-400 text-sm mt-4">Preparing checkout...</p>
          </div>
        </div>
      }
    >
      <CheckoutContent />
    </Suspense>
  );
}
