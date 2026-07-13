"use client";
import { useEffect, useState } from "react";
import { isPlanAtLeast, normalizeApiPlanTier, type PlanTier, PLAN_LABELS } from "../lib/plan";
import { getAccessToken } from "../lib/auth-token";

interface PlanGateProps {
  feature: string;
  required: PlanTier;
  children: React.ReactNode;
  showUpgrade?: boolean;
}

export function PlanGate({ feature: _feature, required, children, showUpgrade = true }: PlanGateProps) {
  const [plan, setPlan] = useState<PlanTier | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPlan() {
      try {
        const token = getAccessToken();
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "https://api.alecrae.com"}/v1/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const body = await res.json() as { data?: { planTier?: string } };
          setPlan(normalizeApiPlanTier(body.data?.planTier));
        } else {
          setPlan("free");
        }
      } catch {
        setPlan("free");
      } finally {
        setLoading(false);
      }
    }
    void fetchPlan();
  }, []);

  if (loading) return null;
  if (plan && isPlanAtLeast(plan, required)) return <>{children}</>;
  if (!showUpgrade) return null;

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center border border-border rounded-xl bg-surface-raised">
      <div className="w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center mb-4">
        <svg className="w-6 h-6 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-content mb-2">
        {PLAN_LABELS[required]} Feature
      </h3>
      <p className="text-content-subtle text-sm mb-6 max-w-xs">
        This feature requires an {PLAN_LABELS[required]} plan or higher. Upgrade to unlock it.
      </p>
      <a
        href="/billing"
        className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors"
      >
        Upgrade to {PLAN_LABELS[required]}
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
      </a>
    </div>
  );
}

export function PlanBadge({ tier }: { tier: PlanTier }) {
  const colors: Record<PlanTier, string> = {
    free: "bg-gray-100 text-gray-600",
    personal: "bg-blue-100 text-blue-700",
    pro: "bg-brand-100 text-brand-700",
    team: "bg-purple-100 text-purple-700",
    business: "bg-emerald-100 text-emerald-700",
    business_plus: "bg-teal-100 text-teal-700",
    enterprise: "bg-amber-100 text-amber-700",
  };
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${colors[tier]}`}>
      {PLAN_LABELS[tier]}
    </span>
  );
}
