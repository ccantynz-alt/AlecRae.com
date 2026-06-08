"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Text,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardFooter,
  PageLayout,
} from "@alecrae/ui";
import { motion } from "motion/react";
import {
  staggerSlow,
  fadeInUp,
  useAlecRaeReducedMotion,
  withReducedMotion,
} from "../../../lib/animations";

// ─── Types ─────────────────────────────────────────────────────────────────

interface PlanLimits {
  emailsPerMonth: number;
  domains: number;
  webhooks: number;
}

interface PlanUsage {
  emailsSent: number;
  percentUsed: number;
}

interface CurrentPlan {
  planId: string;
  name: string;
  limits: PlanLimits;
  usage: PlanUsage;
  periodStartedAt: string;
}

// ─── Plan metadata ─────────────────────────────────────────────────────────

interface PlanMeta {
  id: string;
  label: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  highlighted: boolean;
  checkoutId: "starter" | "professional" | "enterprise" | null;
}

const PLAN_META: PlanMeta[] = [
  {
    id: "free",
    label: "Free",
    price: "$0",
    period: "forever",
    description: "Get started with one account",
    features: [
      "1 email account",
      "5 AI composes per day",
      "30-day search history",
      "Basic smart inbox",
    ],
    highlighted: false,
    checkoutId: null,
  },
  {
    id: "starter",
    label: "Personal",
    price: "$9",
    period: "/month",
    description: "For professionals who mean business",
    features: [
      "3 email accounts",
      "Unlimited AI compose",
      "Unlimited search",
      "E2E encryption",
      "Snooze & schedule send",
      "Voice dictation",
      "Grammar agent",
    ],
    highlighted: true,
    checkoutId: "starter",
  },
  {
    id: "professional",
    label: "Pro",
    price: "$19",
    period: "/month",
    description: "For power users and creators",
    features: [
      "Unlimited accounts",
      "Priority AI",
      "Email analytics",
      "API access",
      "Custom automations",
      "Everything in Personal",
    ],
    highlighted: false,
    checkoutId: "professional",
  },
  {
    id: "enterprise",
    label: "Team",
    price: "$12",
    period: "/user/month",
    description: "For teams that share inboxes",
    features: [
      "Shared inboxes",
      "Admin console",
      "Audit logs",
      "SSO / SAML",
      "Priority support",
      "Everything in Pro",
    ],
    highlighted: false,
    checkoutId: "enterprise",
  },
];

// ─── API helpers ────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("alecrae_api_key") ?? "";
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(body?.error?.message ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Usage bar ──────────────────────────────────────────────────────────────

function UsageBar({
  label,
  used,
  total,
}: {
  label: string;
  used: number;
  total: number;
}): React.ReactNode {
  const unlimited = total <= 0 || total === 999999999;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / total) * 100));
  const danger = pct >= 90;
  const warn = pct >= 70;

  return (
    <Box className="space-y-1.5">
      <Box className="flex items-center justify-between">
        <Text variant="body-sm" className="font-medium">
          {label}
        </Text>
        <Text variant="body-sm" muted>
          {used.toLocaleString()} / {unlimited ? "Unlimited" : total.toLocaleString()}
        </Text>
      </Box>
      {!unlimited && (
        <Box className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
          <Box
            className={`h-full rounded-full transition-all duration-500 ${
              danger ? "bg-red-500" : warn ? "bg-amber-500" : "bg-blue-500"
            }`}
            style={{ width: `${pct}%` }}
          />
        </Box>
      )}
    </Box>
  );
}

// ─── Skeleton ───────────────────────────────────────────────────────────────

function BillingSkeleton(): React.ReactNode {
  return (
    <Box className="space-y-4 animate-pulse">
      <Box className="flex items-center justify-between flex-wrap gap-3">
        <Box className="space-y-2">
          <Box className="h-5 w-36 rounded bg-white/10" />
          <Box className="h-4 w-52 rounded bg-white/10" />
        </Box>
        <Box className="h-8 w-40 rounded-lg bg-white/10" />
      </Box>
      {[1, 2, 3].map((i) => (
        <Box key={i} className="space-y-1.5">
          <Box className="flex justify-between">
            <Box className="h-4 w-40 rounded bg-white/10" />
            <Box className="h-4 w-24 rounded bg-white/10" />
          </Box>
          <Box className="h-2 w-full rounded-full bg-white/10" />
        </Box>
      ))}
    </Box>
  );
}

// ─── Plan card ──────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  isCurrent,
  onUpgrade,
  upgrading,
}: {
  plan: PlanMeta;
  isCurrent: boolean;
  onUpgrade: (checkoutId: "starter" | "professional" | "enterprise") => void;
  upgrading: boolean;
}): React.ReactNode {
  return (
    <Box
      className={`relative flex flex-col p-5 rounded-2xl border transition-all ${
        isCurrent
          ? "bg-blue-500/10 border-blue-500/40"
          : plan.highlighted
            ? "bg-white/[0.06] border-white/20 hover:border-white/30"
            : "bg-white/[0.02] border-white/10 hover:border-white/20"
      }`}
    >
      {isCurrent && (
        <Box className="absolute -top-3 left-4 px-2.5 py-0.5 bg-blue-500 text-white text-xs font-semibold rounded-full">
          Current Plan
        </Box>
      )}
      {!isCurrent && plan.highlighted && (
        <Box className="absolute -top-3 left-4 px-2.5 py-0.5 bg-emerald-500 text-white text-xs font-semibold rounded-full">
          Popular
        </Box>
      )}

      <Box className="mb-4">
        <Text variant="heading-sm" className="mb-0.5">
          {plan.label}
        </Text>
        <Text variant="body-sm" muted>
          {plan.description}
        </Text>
        <Box className="flex items-baseline gap-1 mt-3">
          <Text variant="heading-lg" className="text-white font-bold">
            {plan.price}
          </Text>
          <Text variant="body-sm" muted>
            {plan.period}
          </Text>
        </Box>
      </Box>

      <Box as="ul" className="flex-1 space-y-2 mb-5">
        {plan.features.map((f) => (
          <Box as="li" key={f} className="flex items-start gap-2">
            <Box as="span" className="mt-0.5 flex-shrink-0 text-emerald-400" aria-hidden="true">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </Box>
            <Text variant="body-sm" muted>
              {f}
            </Text>
          </Box>
        ))}
      </Box>

      {isCurrent ? (
        <Box className="py-2 text-center rounded-full border border-blue-500/40 bg-blue-500/10">
          <Text variant="body-sm" className="text-blue-400 font-medium">
            Active
          </Text>
        </Box>
      ) : plan.checkoutId !== null ? (
        <Button
          variant={plan.highlighted ? "primary" : "secondary"}
          size="sm"
          onClick={() => {
            if (plan.checkoutId !== null) {
              onUpgrade(plan.checkoutId);
            }
          }}
          disabled={upgrading}
        >
          {upgrading ? "Redirecting..." : `Get ${plan.label}`}
        </Button>
      ) : (
        <Box className="py-2 text-center rounded-full border border-white/10 bg-white/5">
          <Text variant="body-sm" muted>
            Free forever
          </Text>
        </Box>
      )}
    </Box>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function BillingPage(): React.ReactNode {
  const router = useRouter();
  const reduced = useAlecRaeReducedMotion();
  const itemVariants = withReducedMotion(fadeInUp, reduced);

  const [plan, setPlan] = useState<CurrentPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [upgrading, setUpgrading] = useState(false);

  const loadPlan = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const res = await apiFetch<{ data: CurrentPlan }>("/v1/billing/plan");
      setPlan(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load billing information.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  const handleManageSubscription = async (): Promise<void> => {
    setPortalLoading(true);
    setPortalError(null);
    try {
      const res = await apiFetch<{ data: { url: string } }>("/v1/billing/portal", {
        method: "POST",
        body: JSON.stringify({ returnUrl: window.location.href }),
      });
      window.location.href = res.data.url;
    } catch (err) {
      setPortalError(
        err instanceof Error ? err.message : "Failed to open billing portal.",
      );
      setPortalLoading(false);
    }
  };

  const handleUpgrade = (checkoutId: "starter" | "professional" | "enterprise"): void => {
    setUpgrading(true);
    router.push(`/checkout?plan=${checkoutId}` as never);
  };

  const activePlanId = plan?.planId ?? "free";

  const matchPlanId = (metaId: string): boolean => {
    if (metaId === "free" && (activePlanId === "free" || activePlanId === "")) {
      return true;
    }
    return metaId === activePlanId;
  };

  return (
    <PageLayout
      title="Billing & Subscription"
      description="Manage your plan, usage, and payment details."
    >
      <motion.div
        className="max-w-3xl space-y-6"
        variants={staggerSlow}
        initial="initial"
        animate="animate"
      >
        {/* ── Current plan summary ── */}
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader>
              <Text variant="heading-md">Current Plan</Text>
            </CardHeader>
            <CardContent>
              {loading ? (
                <BillingSkeleton />
              ) : error ? (
                <Box className="py-4 space-y-3">
                  <Text variant="body-sm" className="text-red-400">
                    {error}
                  </Text>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      void loadPlan();
                    }}
                  >
                    Retry
                  </Button>
                </Box>
              ) : plan ? (
                <Box className="space-y-5">
                  <Box className="flex items-center justify-between flex-wrap gap-3">
                    <Box>
                      <Text variant="heading-sm" className="capitalize">
                        {plan.name} Plan
                      </Text>
                      <Text variant="body-sm" muted>
                        Billing period started{" "}
                        {new Date(plan.periodStartedAt).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </Text>
                    </Box>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        void handleManageSubscription();
                      }}
                      disabled={portalLoading}
                    >
                      {portalLoading ? "Opening portal..." : "Manage Subscription"}
                    </Button>
                  </Box>

                  {portalError !== null && (
                    <Text variant="body-sm" className="text-red-400">
                      {portalError}
                    </Text>
                  )}

                  <Box className="space-y-4 pt-1">
                    <UsageBar
                      label="Emails sent this period"
                      used={plan.usage.emailsSent}
                      total={plan.limits.emailsPerMonth}
                    />
                    <UsageBar label="Domains" used={0} total={plan.limits.domains} />
                    <UsageBar label="Webhooks" used={0} total={plan.limits.webhooks} />
                  </Box>
                </Box>
              ) : null}
            </CardContent>
          </Card>
        </motion.div>

        {/* ── Plan comparison ── */}
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader>
              <Text variant="heading-md">Available Plans</Text>
              <Text variant="body-sm" muted>
                Upgrade or change your plan at any time. Changes take effect immediately.
              </Text>
            </CardHeader>
            <CardContent>
              <Box className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {PLAN_META.map((p) => (
                  <PlanCard
                    key={p.id}
                    plan={p}
                    isCurrent={matchPlanId(p.id)}
                    onUpgrade={handleUpgrade}
                    upgrading={upgrading}
                  />
                ))}
              </Box>
            </CardContent>
            <CardFooter>
              <Text variant="body-sm" muted>
                Need Enterprise pricing with on-prem deployment and a dedicated SLA?{" "}
                <Box
                  as="a"
                  href="mailto:hello@alecrae.com?subject=Enterprise%20Pricing"
                  className="inline text-blue-400 hover:text-blue-300"
                >
                  Contact us
                </Box>
              </Text>
            </CardFooter>
          </Card>
        </motion.div>

        {/* ── Included with every plan ── */}
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader>
              <Text variant="heading-md">Included with every plan</Text>
            </CardHeader>
            <CardContent>
              <Box className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  "No ads. Ever.",
                  "No data mining.",
                  "End-to-end encryption available",
                  "Local-first — works offline",
                  "Desktop, mobile, and web apps",
                  "Cancel any time",
                ].map((item) => (
                  <Box key={item} className="flex items-center gap-2">
                    <Box as="span" className="text-emerald-400 flex-shrink-0" aria-hidden="true">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    </Box>
                    <Text variant="body-sm" muted>
                      {item}
                    </Text>
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </PageLayout>
  );
}
