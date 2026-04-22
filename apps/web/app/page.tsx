import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AlecRae — Email, Evolved.",
  description:
    "The AI-native email client that replaces Gmail, Outlook, Grammarly, and Superhuman. One subscription. Every account. Every device.",
};

const FEATURES = [
  {
    title: "AI that sounds like you",
    body: "Voice profile learns your writing style. Drafts are indistinguishable from you — not generic AI slop.",
  },
  {
    title: "Semantic search",
    body: "Find emails by meaning, not keywords. \"The one where someone mentioned the budget\" actually works.",
  },
  {
    title: "Built-in grammar agent",
    body: "Replaces Grammarly. Multi-language. Real-time. Included free — saves you $30/month.",
  },
  {
    title: "Works while you sleep",
    body: "AI agent triages overnight, drafts replies, schedules sends. You approve in the morning with one tap.",
  },
  {
    title: "Every account, one inbox",
    body: "Gmail + Outlook + iCloud + IMAP. Unified AI across all of them. No other client does this.",
  },
  {
    title: "Real email recall",
    body: "Actually revokes sent emails. Not Outlook theater — link-based with cryptographic revocation.",
  },
] as const;

const REPLACEMENTS = [
  { name: "Gmail + Gemini", price: "$12–30/mo" },
  { name: "Grammarly Premium", price: "$12–30/mo" },
  { name: "Superhuman", price: "$30/mo" },
  { name: "Front (per user)", price: "$19–59/mo" },
  { name: "Otter.ai", price: "$10/mo" },
] as const;

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#f5f4ef] text-neutral-900">
      {/* ─── Nav ─────────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-[#f5f4ef]/80 border-b border-neutral-300/40">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <span
            className="text-2xl"
            style={{ fontFamily: "var(--font-italianno), cursive", fontWeight: 400 }}
          >
            AlecRae
          </span>
          <div className="flex items-center gap-6">
            <a
              href="/login"
              className="text-xs tracking-[0.18em] uppercase text-neutral-600 hover:text-neutral-900 transition-colors"
              style={{ fontFamily: "var(--font-inter), sans-serif" }}
            >
              Sign in
            </a>
            <a
              href="/register"
              className="text-xs tracking-[0.18em] uppercase bg-neutral-900 text-[#f5f4ef] px-5 py-2 rounded-full hover:bg-neutral-800 transition-colors"
              style={{ fontFamily: "var(--font-inter), sans-serif" }}
            >
              Get Early Access
            </a>
          </div>
        </div>
      </nav>

      {/* ─── Hero ────────────────────────────────────────────────── */}
      <section className="pt-40 pb-24 px-6 flex flex-col items-center text-center">
        <h1
          className="text-[5rem] sm:text-[8rem] md:text-[11rem] lg:text-[14rem] leading-[0.85] text-neutral-900 select-none"
          style={{
            fontFamily: "var(--font-italianno), 'Snell Roundhand', cursive",
            fontWeight: 400,
            letterSpacing: "-0.01em",
          }}
        >
          AlecRae
        </h1>
        <div className="mt-3 mb-8 w-48 md:w-64 h-px bg-neutral-400/50" aria-hidden="true" />
        <p
          className="max-w-2xl text-lg sm:text-xl text-neutral-600 leading-relaxed font-light"
          style={{ fontFamily: "var(--font-inter), sans-serif" }}
        >
          The email client you&rsquo;d sign your name to. AI in every layer.
          One subscription replaces Gmail, Grammarly, Superhuman, and five other tools.
"use client";

/**
 * AlecRae — Coming Soon Landing Page
 *
 * A polished, one-page marketing preview suitable for showing to customers.
 * Not the final product site — just enough shape to communicate:
 *   1. What AlecRae is (email, reinvented)
 *   2. Why it wins (AI-native, universal, private, instant)
 *   3. What it replaces (a $100+/mo stack for $9)
 *   4. How to get in (waitlist)
 *
 * Design language: Apple-minimal, ivory paper, warm charcoal ink,
 * a single gold accent. Italianno wordmark, Inter everywhere else.
 * Quiet, expensive, confident.
 */

import { useState } from "react";

const WORDMARK_FONT =
  "var(--font-italianno), 'Snell Roundhand', 'Apple Chancery', cursive";

const GOLD = "#cfa630";
const GOLD_SOFT = "#efc870";

interface Feature {
  number: string;
  title: string;
  body: string;
}

const FEATURES: Feature[] = [
  {
    number: "01",
    title: "AI-native, not AI-bolted-on",
    body:
      "A voice profile that learns how you write. A grammar agent that replaces Grammarly. A dictation engine that outlasted Dragon. Every layer of the client speaks fluent language.",
  },
  {
    number: "02",
    title: "Every account, one inbox",
    body:
      "Gmail, Outlook, iCloud, Yahoo, custom IMAP — unified under one AI layer. Compose from any address. Search across all of them. One subscription, every mailbox you own.",
  },
  {
    number: "03",
    title: "Private by architecture",
    body:
      "Client-side GPU inference for the models that can run locally. End-to-end encryption for the messages that should. No ads. No trackers. No data mining. Not a policy — a design.",
  },
  {
    number: "04",
    title: "Instant, everywhere",
    body:
      "Local-first cache. Sub-100ms inbox. Edge-deployed API. Desktop, mobile, web — same speed, same shortcuts, same intelligence. Email that finally keeps up with you.",
  },
];

interface Row {
  tool: string;
  price: string;
}

const STACK_REPLACED: Row[] = [
  { tool: "Gmail Workspace + Gemini", price: "$12 – $30 /mo" },
  { tool: "Grammarly Premium", price: "$12 – $30 /mo" },
  { tool: "Dragon Professional", price: "$500 once (discontinued)" },
  { tool: "Front shared inbox", price: "$19 – $59 /user /mo" },
  { tool: "Superhuman", price: "$30 /mo" },
  { tool: "Proton Mail", price: "$5 – $10 /mo" },
  { tool: "Otter.ai transcription", price: "$10 /mo" },
];

export default function LandingPage(): React.JSX.Element {
  return (
    <main className="bg-[color:var(--ivory)] text-neutral-900" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}>
      <Hero />
      <Manifesto />
      <Features />
      <StackReplaced />
      <Waitlist />
      <Footer />
    </main>
  );
}

function Hero(): React.JSX.Element {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <div
        className="absolute top-10 left-0 right-0 text-center text-[10px] uppercase tracking-[0.4em] text-neutral-500"
        aria-hidden="true"
      >
        Introducing
      </div>

      <h1
        className="text-[6rem] sm:text-[9rem] md:text-[13rem] lg:text-[15rem] leading-[0.85] select-none"
        style={{ fontFamily: WORDMARK_FONT, fontWeight: 400, letterSpacing: "-0.01em" }}
      >
        AlecRae
      </h1>

      <div
        className="mt-4 mb-10 w-48 md:w-64 h-px bg-neutral-400/50"
        aria-hidden="true"
      />

      <p className="text-sm md:text-base text-neutral-600 font-light tracking-[0.2em]">
        Email, considered.
      </p>

      <p className="mt-6 max-w-xl text-[15px] md:text-base text-neutral-700 leading-relaxed px-2">
        A single, quiet, intelligent client for every account you own —
        built for people who read more than they click and still expect things
        to feel effortless.
      </p>

      <a
        href="#waitlist"
        className="mt-12 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.35em] text-neutral-700 hover:text-black transition-colors"
      >
        Request access
        <span aria-hidden="true">&#8594;</span>
      </a>

      <div
        className="absolute bottom-10 left-0 right-0 flex justify-center"
        aria-hidden="true"
      >
        <div className="w-px h-12 bg-neutral-400/60" />
      </div>
    </section>
  );
}

function Manifesto(): React.JSX.Element {
  return (
    <section className="px-6 py-32 md:py-48 flex justify-center">
      <div className="max-w-3xl text-center">
        <p className="text-[10px] uppercase tracking-[0.4em] text-neutral-500 mb-8">
          The case
        </p>
        <p
          className="text-2xl md:text-4xl leading-[1.35] text-neutral-900 font-light"
          style={{ letterSpacing: "-0.01em" }}
        >
          Email has not been meaningfully reinvented since 2004. The people
          who write thousands of messages a year deserve a client that
          understands them — not one that shows them ads between their
          sentences.
        </p>
        <div
          className="mt-10 mx-auto w-16 h-px bg-neutral-400/50"
          aria-hidden="true"
        />
        <p className="mt-10 text-sm text-neutral-600 tracking-[0.15em] uppercase">
          AlecRae is that client.
        </p>
      </div>
    </section>
  );
}

function Features(): React.JSX.Element {
  return (
    <section className="px-6 py-24 md:py-32 bg-[color:var(--ivory)] border-t border-neutral-300/60">
      <div className="max-w-5xl mx-auto">
        <p className="text-[10px] uppercase tracking-[0.4em] text-neutral-500 text-center mb-16">
          Four pillars
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-4">
          <a
            href="/register"
            className="px-8 py-3.5 bg-neutral-900 text-[#f5f4ef] rounded-full text-sm tracking-[0.12em] uppercase hover:bg-neutral-800 transition-colors"
            style={{ fontFamily: "var(--font-inter), sans-serif" }}
          >
            Get Early Access
          </a>
          <a
            href="#features"
            className="px-8 py-3.5 border border-neutral-400/60 rounded-full text-sm tracking-[0.12em] uppercase text-neutral-700 hover:border-neutral-600 transition-colors"
            style={{ fontFamily: "var(--font-inter), sans-serif" }}
          >
            See What&rsquo;s Inside
          </a>
        </div>
      </section>

      {/* ─── Social proof strip ──────────────────────────────────── */}
      <section className="border-y border-neutral-300/50 py-6">
        <div className="max-w-4xl mx-auto px-6 flex flex-wrap items-center justify-center gap-x-12 gap-y-3">
          <span
            className="text-[11px] tracking-[0.25em] uppercase text-neutral-500"
            style={{ fontFamily: "var(--font-inter), sans-serif" }}
          >
            Replaces
          </span>
          {REPLACEMENTS.map((r) => (
            <span key={r.name} className="flex items-baseline gap-2">
              <span
                className="text-sm text-neutral-700"
                style={{ fontFamily: "var(--font-inter), sans-serif" }}
              >
                {r.name}
              </span>
              <span
                className="text-xs text-neutral-400 line-through"
                style={{ fontFamily: "var(--font-inter), sans-serif" }}
              >
                {r.price}
              </span>
            </span>
          ))}
        </div>
      </section>

      {/* ─── Features grid ───────────────────────────────────────── */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <h2
            className="text-center text-4xl sm:text-5xl mb-4"
            style={{
              fontFamily: "var(--font-italianno), cursive",
              fontWeight: 400,
            }}
          >
            What makes it different
          </h2>
          <p
            className="text-center text-sm text-neutral-500 mb-16 tracking-[0.12em] uppercase"
            style={{ fontFamily: "var(--font-inter), sans-serif" }}
          >
            Not bolt-on AI. AI in every layer.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-neutral-300/50 border border-neutral-300/50 rounded-2xl overflow-hidden">
            {FEATURES.map((f) => (
              <article key={f.title} className="bg-[#f5f4ef] p-8 flex flex-col gap-3">
                <h3
                  className="text-base font-medium text-neutral-900"
                  style={{ fontFamily: "var(--font-inter), sans-serif" }}
                >
                  {f.title}
                </h3>
                <p
                  className="text-sm text-neutral-600 leading-relaxed"
                  style={{ fontFamily: "var(--font-inter), sans-serif" }}
                >
                  {f.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Pricing ─────────────────────────────────────────────── */}
      <section className="py-24 px-6 border-t border-neutral-300/50">
        <div className="max-w-4xl mx-auto text-center">
          <h2
            className="text-4xl sm:text-5xl mb-4"
            style={{ fontFamily: "var(--font-italianno), cursive", fontWeight: 400 }}
          >
            Simple pricing
          </h2>
          <p
            className="text-sm text-neutral-500 mb-16 tracking-[0.12em] uppercase"
            style={{ fontFamily: "var(--font-inter), sans-serif" }}
          >
            One subscription replaces your entire stack
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {/* Free */}
            <div className="rounded-2xl border border-neutral-300/60 bg-[#fafaf6] p-8 text-left">
              <p className="text-xs tracking-[0.18em] uppercase text-neutral-500 mb-2" style={{ fontFamily: "var(--font-inter), sans-serif" }}>Free</p>
              <p className="text-3xl font-light text-neutral-900 mb-4" style={{ fontFamily: "var(--font-inter), sans-serif" }}>$0<span className="text-sm text-neutral-500">/mo</span></p>
              <ul className="space-y-2 text-sm text-neutral-600" style={{ fontFamily: "var(--font-inter), sans-serif" }}>
                <li>1 email account</li>
                <li>Basic AI (5 composes/day)</li>
                <li>30-day search</li>
              </ul>
            </div>

            {/* Personal — highlighted */}
            <div className="rounded-2xl border-2 border-neutral-900 bg-neutral-900 text-[#f5f4ef] p-8 text-left relative">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-neutral-900 text-[#f5f4ef] text-[10px] tracking-[0.2em] uppercase px-4 py-1 rounded-full" style={{ fontFamily: "var(--font-inter), sans-serif" }}>Most popular</span>
              <p className="text-xs tracking-[0.18em] uppercase text-neutral-400 mb-2" style={{ fontFamily: "var(--font-inter), sans-serif" }}>Personal</p>
              <p className="text-3xl font-light mb-4" style={{ fontFamily: "var(--font-inter), sans-serif" }}>$9<span className="text-sm text-neutral-400">/mo</span></p>
              <ul className="space-y-2 text-sm text-neutral-300" style={{ fontFamily: "var(--font-inter), sans-serif" }}>
                <li>3 email accounts</li>
                <li>Full AI + voice profile</li>
                <li>Unlimited search</li>
                <li>E2E encryption</li>
                <li>Snooze + schedule send</li>
              </ul>
            </div>

            {/* Pro */}
            <div className="rounded-2xl border border-neutral-300/60 bg-[#fafaf6] p-8 text-left">
              <p className="text-xs tracking-[0.18em] uppercase text-neutral-500 mb-2" style={{ fontFamily: "var(--font-inter), sans-serif" }}>Pro</p>
              <p className="text-3xl font-light text-neutral-900 mb-4" style={{ fontFamily: "var(--font-inter), sans-serif" }}>$19<span className="text-sm text-neutral-500">/mo</span></p>
              <ul className="space-y-2 text-sm text-neutral-600" style={{ fontFamily: "var(--font-inter), sans-serif" }}>
                <li>Unlimited accounts</li>
                <li>Priority AI (Sonnet)</li>
                <li>Team features</li>
                <li>API access</li>
                <li>Analytics</li>
              </ul>
            </div>
          </div>

          <p
            className="mt-8 text-xs text-neutral-500"
            style={{ fontFamily: "var(--font-inter), sans-serif" }}
          >
            Team plan: $12/user/mo with shared inboxes, SSO, and admin console. Enterprise: custom.
          </p>
        </div>
      </section>

      {/* ─── CTA ─────────────────────────────────────────────────── */}
      <section className="py-24 px-6 border-t border-neutral-300/50">
        <div className="max-w-3xl mx-auto text-center">
          <h2
            className="text-5xl sm:text-6xl mb-6"
            style={{ fontFamily: "var(--font-italianno), cursive", fontWeight: 400 }}
          >
            Email, evolved.
          </h2>
          <p
            className="text-neutral-600 mb-10 text-base leading-relaxed"
            style={{ fontFamily: "var(--font-inter), sans-serif" }}
          >
            Gmail is 22 years old. Outlook predates the iPhone. It&rsquo;s time for
            email that works the way you think.
          </p>
          <a
            href="/register"
            className="inline-block px-10 py-4 bg-neutral-900 text-[#f5f4ef] rounded-full text-sm tracking-[0.12em] uppercase hover:bg-neutral-800 transition-colors"
            style={{ fontFamily: "var(--font-inter), sans-serif" }}
          >
            Get Early Access — Free
          </a>
        </div>
      </section>

      {/* ─── Footer ──────────────────────────────────────────────── */}
      <footer className="border-t border-neutral-300/50 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <span
            className="text-xl"
            style={{ fontFamily: "var(--font-italianno), cursive", fontWeight: 400 }}
          >
            AlecRae
          </span>
          <div className="flex gap-8" style={{ fontFamily: "var(--font-inter), sans-serif" }}>
            <a href="/terms" className="text-xs text-neutral-500 hover:text-neutral-900 transition-colors">Terms</a>
            <a href="/privacy" className="text-xs text-neutral-500 hover:text-neutral-900 transition-colors">Privacy</a>
            <a href="/admin" className="text-xs text-neutral-500 hover:text-neutral-900 transition-colors">Admin</a>
          </div>
          <span
            className="text-[10px] text-neutral-500/70 tracking-[0.25em] uppercase"
            style={{ fontFamily: "var(--font-inter), sans-serif" }}
          >
            &copy; 2026 AlecRae
          </span>
        </div>
      </footer>
    </main>
        <div className="grid md:grid-cols-2 gap-14 md:gap-20">
          {FEATURES.map((f) => (
            <article key={f.number} className="relative">
              <div
                className="text-sm font-mono mb-4"
                style={{ color: GOLD }}
              >
                {f.number}
              </div>
              <h3
                className="text-xl md:text-2xl mb-3 text-neutral-900"
                style={{ fontWeight: 500, letterSpacing: "-0.01em" }}
              >
                {f.title}
              </h3>
              <p className="text-[15px] leading-relaxed text-neutral-600">
                {f.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function StackReplaced(): React.JSX.Element {
  return (
    <section className="px-6 py-28 md:py-40 border-t border-neutral-300/60">
      <div className="max-w-3xl mx-auto text-center">
        <p className="text-[10px] uppercase tracking-[0.4em] text-neutral-500 mb-8">
          What it replaces
        </p>
        <h2
          className="text-3xl md:text-5xl mb-6 text-neutral-900 font-light"
          style={{ letterSpacing: "-0.02em" }}
        >
          One subscription.
          <br />
          A whole stack, retired.
        </h2>
        <p className="text-base text-neutral-600 leading-relaxed max-w-xl mx-auto">
          Most knowledge workers stitch together seven tools to get through a
          day of email. AlecRae folds them into one.
        </p>

        <div className="mt-16 text-left">
          <ul className="divide-y divide-neutral-300/70">
            {STACK_REPLACED.map((row) => (
              <li
                key={row.tool}
                className="flex items-center justify-between py-4 text-[15px]"
              >
                <span className="text-neutral-800">{row.tool}</span>
                <span className="text-neutral-500 font-mono text-sm">
                  {row.price}
                </span>
              </li>
            ))}
          </ul>

          <div
            className="mt-8 flex items-center justify-between py-5 border-t border-neutral-400"
            style={{ borderTopWidth: "2px" }}
          >
            <span
              className="text-lg"
              style={{ fontFamily: WORDMARK_FONT, fontSize: "2.5rem", lineHeight: 1 }}
            >
              AlecRae
            </span>
            <span
              className="font-mono text-base"
              style={{ color: GOLD, fontWeight: 500 }}
            >
              $9 /mo
            </span>
          </div>
        </div>

        <p className="mt-10 text-xs text-neutral-500 tracking-[0.1em]">
          Pricing indicative. Free tier available at launch.
        </p>
      </div>
    </section>
  );
}

function Waitlist(): React.JSX.Element {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!email.includes("@")) return;
    // Decorative only — real signup wires up at launch.
    setSubmitted(true);
  };

  return (
    <section
      id="waitlist"
      className="px-6 py-28 md:py-40 bg-[color:var(--ink)] text-neutral-100 border-t border-neutral-800"
    >
      <div className="max-w-xl mx-auto text-center">
        <p className="text-[10px] uppercase tracking-[0.4em] text-neutral-500 mb-8">
          Private beta
        </p>
        <h2
          className="text-3xl md:text-5xl mb-6 font-light"
          style={{ letterSpacing: "-0.02em" }}
        >
          First five hundred.
        </h2>
        <p className="text-base text-neutral-400 leading-relaxed">
          We&rsquo;re letting a small group in first — people who write a lot
          of email and care about how it feels. If that&rsquo;s you, leave us
          a note.
        </p>

        {submitted ? (
          <div
            className="mt-12 py-8 px-6 border rounded-sm"
            style={{ borderColor: GOLD_SOFT }}
          >
            <p
              className="text-2xl mb-2"
              style={{ fontFamily: WORDMARK_FONT, color: GOLD_SOFT }}
            >
              Thank you.
            </p>
            <p className="text-sm text-neutral-400">
              You&rsquo;re on the list. We&rsquo;ll be in touch before launch.
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="mt-12 flex flex-col sm:flex-row items-stretch gap-3 max-w-md mx-auto"
          >
            <input
              type="email"
              required
              aria-label="Email address"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 bg-transparent border border-neutral-700 focus:border-neutral-400 rounded-sm px-4 py-3 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none transition-colors"
            />
            <button
              type="submit"
              className="px-5 py-3 text-xs uppercase tracking-[0.25em] text-[color:var(--ink)] rounded-sm transition-opacity hover:opacity-90"
              style={{ background: GOLD_SOFT }}
            >
              Request invite
            </button>
          </form>
        )}

        <p className="mt-8 text-[11px] text-neutral-600 tracking-[0.15em] uppercase">
          No spam. One email when your invite is ready.
        </p>
      </div>
    </section>
  );
}

function Footer(): React.JSX.Element {
  return (
    <footer className="px-6 py-20 bg-[color:var(--ivory)] border-t border-neutral-300/60">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <span
          className="text-5xl select-none"
          style={{ fontFamily: WORDMARK_FONT, lineHeight: 1 }}
        >
          AlecRae
        </span>

        <div className="flex items-center gap-6 text-[11px] uppercase tracking-[0.25em] text-neutral-500">
          <a href="/privacy" className="hover:text-neutral-800 transition-colors">
            Privacy
          </a>
          <a href="/terms" className="hover:text-neutral-800 transition-colors">
            Terms
          </a>
          <a href="/security" className="hover:text-neutral-800 transition-colors">
            Security
          </a>
        </div>

        <span className="text-[10px] uppercase tracking-[0.3em] text-neutral-500">
          &copy; 2026 AlecRae
        </span>
      </div>
    </footer>
  );
}
