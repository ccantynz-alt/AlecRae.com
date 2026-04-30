"use client";

import { motion } from "motion/react";
import Link from "next/link";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    features: [
      "1 email account",
      "5 AI composes per day",
      "30-day search history",
      "Basic smart inbox",
      "Keyboard shortcuts",
    ],
    cta: "Start Free",
    highlighted: false,
  },
  {
    name: "Personal",
    price: "$9",
    period: "/month",
    features: [
      "3 email accounts",
      "Unlimited AI compose",
      "Unlimited search",
      "E2E encryption",
      "Snooze & schedule send",
      "Voice dictation",
      "Grammar agent",
      "Email recall",
    ],
    cta: "Get Personal",
    highlighted: true,
  },
  {
    name: "Pro",
    price: "$19",
    period: "/month",
    features: [
      "Unlimited accounts",
      "Priority AI (faster model)",
      "Email analytics",
      "API access",
      "Custom automations",
      "Advanced search",
      "Everything in Personal",
    ],
    cta: "Go Pro",
    highlighted: false,
  },
  {
    name: "Team",
    price: "$12",
    period: "/user/month",
    features: [
      "Shared inboxes",
      "Admin console",
      "Audit logs",
      "SSO / SAML",
      "Priority support",
      "Collaboration tools",
      "Everything in Pro",
    ],
    cta: "Start Team Trial",
    highlighted: false,
  },
];

export function Pricing(): React.ReactNode {
  return (
    <section id="pricing" className="relative py-32 px-6">
      <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

      <div className="max-w-6xl mx-auto pt-24">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 mb-6">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-blue-300/80"
            >
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            <span className="text-xs font-medium text-blue-300/80 tracking-wide">
              Pricing
            </span>
          </div>

          <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold tracking-tighter text-white mb-5">
            Simple pricing.{" "}
            <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
              Stupid simple.
            </span>
          </h2>
          <p className="text-lg text-white/35 max-w-xl mx-auto">
            Start free. Upgrade when you&apos;re ready. Cancel anytime. No
            tricks.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{
                type: "spring",
                stiffness: 100,
                damping: 15,
                delay: i * 0.1,
              }}
              className={`relative flex flex-col rounded-2xl transition-all ${
                plan.highlighted
                  ? "p-[1px] bg-gradient-to-b from-violet-500/60 via-cyan-500/40 to-violet-500/20 lg:scale-[1.04] z-10"
                  : ""
              }`}
            >
              {plan.highlighted && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.6, y: 10 }}
                  whileInView={{ opacity: 1, scale: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 12,
                    delay: 0.4,
                  }}
                  className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-20"
                >
                  <span className="px-4 py-1 bg-gradient-to-r from-violet-500 to-cyan-500 text-white text-xs font-semibold rounded-full shadow-lg shadow-violet-500/25 whitespace-nowrap">
                    Most Popular
                  </span>
                </motion.div>
              )}

              <div
                className={`flex flex-col flex-1 p-6 rounded-2xl ${
                  plan.highlighted
                    ? "bg-gradient-to-b from-violet-500/10 to-cyan-500/5 backdrop-blur-sm"
                    : "bg-gradient-to-b from-white/[0.04] to-white/[0.02] border border-white/[0.08] hover:border-white/[0.15]"
                } transition-all`}
              >
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-white mb-1">
                    {plan.name}
                  </h3>
                  <div className="flex items-baseline gap-1 mt-4">
                    <span className="text-4xl font-bold tracking-tighter text-white">
                      {plan.price}
                    </span>
                    <span className="text-sm text-white/35">{plan.period}</span>
                  </div>
                </div>

                <ul className="flex-1 space-y-3 mb-8">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2.5 text-sm text-white/40"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-emerald-400 mt-0.5 flex-shrink-0"
                      >
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  href="/register"
                  className={`block text-center py-2.5 rounded-full text-sm font-medium transition-all ${
                    plan.highlighted
                      ? "bg-white text-[#0a0a0f] hover:bg-white/90 shadow-lg shadow-white/10"
                      : "bg-white/[0.06] text-white hover:bg-white/[0.12] border border-white/[0.08]"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="text-center mt-14"
        >
          <p className="text-sm text-white/35">
            Need enterprise? Custom pricing with on-prem deployment, SLA, and
            dedicated support.{" "}
            <a
              href="mailto:hello@alecrae.com"
              className="text-violet-400 hover:text-violet-300 underline underline-offset-2 transition-colors"
            >
              Contact us
            </a>
          </p>
        </motion.div>
      </div>
    </section>
  );
}
