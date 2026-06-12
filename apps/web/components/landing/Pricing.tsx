import Link from "next/link";
import type { Route } from "next";
import { Reveal } from "./Reveal";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    desc: "Get started with one account",
    features: ["1 email account", "5 AI composes per day", "30-day search history", "Basic smart inbox", "Keyboard shortcuts"],
    cta: "Start free",
    highlighted: false,
    href: "/register",
  },
  {
    name: "Personal",
    price: "$9",
    period: "/month",
    desc: "For professionals who mean business",
    features: ["3 email accounts", "Unlimited AI compose", "Unlimited search", "E2E encryption", "Snooze & schedule send", "Voice dictation", "Grammar agent", "Email recall"],
    cta: "Get Personal",
    highlighted: true,
    href: "/checkout?plan=starter",
  },
  {
    name: "Pro",
    price: "$19",
    period: "/month",
    desc: "For power users and creators",
    features: ["Unlimited accounts", "Priority AI (faster model)", "Email analytics", "API access", "Custom automations", "Advanced search operators", "Everything in Personal"],
    cta: "Go Pro",
    highlighted: false,
    href: "/checkout?plan=professional",
  },
  {
    name: "Team",
    price: "$12",
    period: "/user/month",
    desc: "For teams that share inboxes",
    features: ["Shared inboxes", "Admin console", "Audit logs", "SSO / SAML", "Priority support", "Collaboration tools", "Everything in Pro"],
    cta: "Start team trial",
    highlighted: false,
    href: "/checkout?plan=enterprise",
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="py-28 px-6 border-t border-[#e3dfd3]">
      <div className="max-w-6xl mx-auto">
        <Reveal className="text-center mb-16">
          <p className="text-xs uppercase tracking-[0.3em] text-[#9a7b4f] mb-5">Pricing</p>
          <h2 className="font-serif text-3xl md:text-5xl tracking-tight text-[#1c1a17] mb-5">
            Simple pricing. No surprises.
          </h2>
          <p className="text-lg text-[#6b6557] max-w-xl mx-auto">
            Start free. Upgrade when you need more. Cancel anytime.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((plan, i) => (
            <Reveal
              key={plan.name}
              delay={i * 0.08}
              rootMargin="-50px"
              className={`relative flex flex-col p-7 rounded-2xl border transition-colors ${
                plan.highlighted
                  ? "bg-white border-[#1f3d2e] shadow-[0_20px_40px_-20px_rgba(31,61,46,0.25)]"
                  : "bg-white border-[#e3dfd3] hover:border-[#1f3d2e]/30"
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-[#1f3d2e] text-[#f5f4ef] text-xs font-medium tracking-wide rounded-full whitespace-nowrap">
                  Most popular
                </div>
              )}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-[#1c1a17] mb-1">{plan.name}</h3>
                <p className="text-sm text-[#8a8475] mb-4">{plan.desc}</p>
                <div className="flex items-baseline gap-1">
                  <span className="font-serif text-4xl text-[#1c1a17]">{plan.price}</span>
                  <span className="text-sm text-[#8a8475]">{plan.period}</span>
                </div>
              </div>
              <ul className="flex-1 space-y-3 mb-8">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-[#57534a]">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#1f3d2e] mt-0.5 flex-shrink-0">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={plan.href as Route}
                className={`text-center py-2.5 rounded-full text-sm font-medium transition-colors ${
                  plan.highlighted
                    ? "bg-[#1c1a17] text-[#f5f4ef] hover:bg-[#1f3d2e]"
                    : "border border-[#1c1a17]/20 text-[#1c1a17] hover:border-[#1c1a17]/50"
                }`}
              >
                {plan.cta}
              </Link>
            </Reveal>
          ))}
        </div>

        <Reveal as="p" className="text-center text-sm text-[#8a8475] mt-10">
          Need enterprise? Custom pricing with on-prem deployment, SLA, and dedicated support.{" "}
          <a href="mailto:hello@alecrae.com" className="text-[#1f3d2e] hover:underline">Contact us</a>
        </Reveal>
      </div>
    </section>
  );
}
