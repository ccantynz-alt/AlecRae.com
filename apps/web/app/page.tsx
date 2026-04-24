import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AlecRae — Email, Evolved.",
  description:
    "The AI-native email client that replaces Gmail, Outlook, Grammarly, and Superhuman. One subscription. Every account. Every device.",
};

const FEATURES = [
  {
    title: "AI that sounds like you",
    body: "Voice profile learns your writing style. Drafts are indistinguishable from you — not generic AI.",
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
  { name: "Dragon Professional", price: "$500 (discontinued)" },
] as const;

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#f5f4ef] text-neutral-900">

      {/* ─── Nav ──────────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-[#f5f4ef]/80 border-b border-neutral-300/40">
        <div
          className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between"
          style={{ fontFamily: "var(--font-inter), sans-serif" }}
        >
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
            >
              Sign in
            </a>
            <a
              href="/register"
              className="text-xs tracking-[0.18em] uppercase bg-neutral-900 text-[#f5f4ef] px-5 py-2 rounded-full hover:bg-neutral-800 transition-colors"
            >
              Get Early Access
            </a>
          </div>
        </div>
      </nav>

      {/* ─── Hero ─────────────────────────────────────────────────── */}
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
        </p>
        <div
          className="mt-10 flex flex-col sm:flex-row gap-4"
          style={{ fontFamily: "var(--font-inter), sans-serif" }}
        >
          <a
            href="/register"
            className="px-8 py-3.5 bg-neutral-900 text-[#f5f4ef] rounded-full text-sm tracking-[0.12em] uppercase hover:bg-neutral-800 transition-colors"
          >
            Get Early Access
          </a>
          <a
            href="#features"
            className="px-8 py-3.5 border border-neutral-400/60 rounded-full text-sm tracking-[0.12em] uppercase text-neutral-700 hover:border-neutral-600 transition-colors"
          >
            See What&rsquo;s Inside
          </a>
        </div>
      </section>

      {/* ─── Social proof strip ───────────────────────────────────── */}
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

      {/* ─── Features grid ────────────────────────────────────────── */}
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

      {/* ─── Pricing ──────────────────────────────────────────────── */}
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
            <div className="rounded-2xl border border-neutral-300/60 bg-[#fafaf6] p-8 text-left">
              <p className="text-xs tracking-[0.18em] uppercase text-neutral-500 mb-2" style={{ fontFamily: "var(--font-inter), sans-serif" }}>Free</p>
              <p className="text-3xl font-light text-neutral-900 mb-4" style={{ fontFamily: "var(--font-inter), sans-serif" }}>$0<span className="text-sm text-neutral-500">/mo</span></p>
              <ul className="space-y-2 text-sm text-neutral-600" style={{ fontFamily: "var(--font-inter), sans-serif" }}>
                <li>1 email account</li>
                <li>Basic AI (5 composes/day)</li>
                <li>30-day search</li>
              </ul>
            </div>
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

      {/* ─── CTA ──────────────────────────────────────────────────── */}
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
            Gmail is 22 years old. Outlook predates the iPhone. It&rsquo;s time
            for email that works the way you think.
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

      {/* ─── Footer ───────────────────────────────────────────────── */}
      <footer className="border-t border-neutral-300/50 py-10 px-6">
        <div
          className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6"
          style={{ fontFamily: "var(--font-inter), sans-serif" }}
        >
          <span
            className="text-xl"
            style={{ fontFamily: "var(--font-italianno), cursive", fontWeight: 400 }}
          >
            AlecRae
          </span>
          <div className="flex gap-8">
            <a href="/terms" className="text-xs text-neutral-500 hover:text-neutral-900 transition-colors">Terms</a>
            <a href="/privacy" className="text-xs text-neutral-500 hover:text-neutral-900 transition-colors">Privacy</a>
            <a href="/roadmap" className="text-xs text-neutral-500 hover:text-neutral-900 transition-colors">Roadmap</a>
            <a href="/admin" className="text-xs text-neutral-500 hover:text-neutral-900 transition-colors">Admin</a>
          </div>
          <span className="text-[10px] text-neutral-500/70 tracking-[0.25em] uppercase">
            &copy; 2026 AlecRae
          </span>
        </div>
      </footer>

    </main>
  );
}
