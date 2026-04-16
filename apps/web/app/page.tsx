"use client";

/**
 * AlecRae — Customer Preview Landing
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
const BODY_FONT = "var(--font-inter), system-ui, sans-serif";

const IVORY = "#f5f4ef";
const INK = "#0b0a08";
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

export default function LandingPage() {
  return (
    <main
      className="min-h-screen bg-[color:var(--ivory)] text-[color:var(--ink)]"
      style={
        {
          ["--ivory" as string]: IVORY,
          ["--ink" as string]: INK,
          ["--gold" as string]: GOLD,
          ["--gold-soft" as string]: GOLD_SOFT,
          fontFamily: BODY_FONT,
        } as React.CSSProperties
      }
    >
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
