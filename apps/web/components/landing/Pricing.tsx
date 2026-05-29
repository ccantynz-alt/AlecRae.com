"use client";

import { motion } from "motion/react";
import Link from "next/link";

const fadeUp = { initial: { opacity: 0, y: 30 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-100px" }, transition: { duration: 0.6 } };

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    desc: "Get started with one account",
    features: ["1 email account", "5 AI composes per day", "30-day search history", "Basic smart inbox", "Keyboard shortcuts"],
    cta: "Start Free",
    highlighted: false,
  },
  {
    name: "Personal",
    price: "$9",
    period: "/month",
    desc: "For professionals who mean business",
    features: ["3 email accounts", "Unlimited AI compose", "Unlimited search", "E2E encryption", "Snooze & schedule send", "Voice dictation", "Grammar agent", "Email recall"],
    cta: "Get Personal",
    highlighted: true,
  },
  {
    name: "Pro",
    price: "$19",
    period: "/month",
    desc: "For power users and creators",
    features: ["Unlimited accounts", "Priority AI (faster model)", "Email analytics", "API access", "Custom automations", "Advanced search operators", "Everything in Personal"],
    cta: "Go Pro",
    highlighted: false,
  },
  {
    name: "Team",
    price: "$12",
    period: "/user/month",
    desc: "For teams that share inboxes",
    features: ["Shared inboxes", "Admin console", "Audit logs", "SSO / SAML", "Priority support", "Collaboration tools", "Everything in Pro"],
    cta: "Start Team Trial",
    highlighted: false,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="py-32 px-6">
      <div className="max-w-6xl mx-auto">
        <motion.div {...fadeUp} className="text-center mb-16">
          <p className="text-sm font-medium uppercase tracking-widest text-blue-400 mb-4">Pricing</p>
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-4">
            Simple pricing. No surprises.
          </h2>
          <p className="text-lg text-blue-100/50 max-w-xl mx-auto">
            Start free. Upgrade when you need more. Cancel anytime.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className={`relative flex flex-col p-6 rounded-2xl border transition-all ${
                plan.highlighted
                  ? "bg-white/[0.08] border-blue-500/50 shadow-lg shadow-blue-500/10"
                  : "bg-white/[0.03] border-white/10 hover:border-white/20"
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-blue-500 text-white text-xs font-semibold rounded-full">
                  Most Popular
                </div>
              )}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-white mb-1">{plan.name}</h3>
                <p className="text-sm text-blue-100/40 mb-4">{plan.desc}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-white">{plan.price}</span>
                  <span className="text-sm text-blue-100/40">{plan.period}</span>
                </div>
              </div>
              <ul className="flex-1 space-y-3 mb-8">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-blue-100/60">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400 mt-0.5 flex-shrink-0">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/register"
                className={`text-center py-2.5 rounded-full text-sm font-medium transition-all ${
                  plan.highlighted
                    ? "bg-white text-slate-950 hover:bg-blue-100"
                    : "bg-white/10 text-white hover:bg-white/20 border border-white/10"
                }`}
              >
                {plan.cta}
              </Link>
            </motion.div>
          ))}
        </div>

        <motion.p {...fadeUp} className="text-center text-sm text-blue-100/30 mt-8">
          Need enterprise? Custom pricing with on-prem deployment, SLA, and dedicated support.{" "}
          <a href="mailto:hello@alecrae.com" className="text-blue-400 hover:text-blue-300 underline">Contact us</a>
        </motion.p>
      </div>
    </section>
  );
}
