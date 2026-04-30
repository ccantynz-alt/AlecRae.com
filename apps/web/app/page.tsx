import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AlecRae — Email, Evolved.",
  description:
    "The AI-native email client that replaces Gmail, Outlook, Grammarly, and Superhuman. One subscription. Every account. Every device.",
};

const FEATURES = [
  {
    icon: "✦",
    title: "AI that sounds like you",
    body: "Voice profile learns your writing style. Drafts are indistinguishable from you — not generic AI.",
  },
  {
    icon: "⌕",
    title: "Semantic search",
    body: "Find emails by meaning, not keywords. \"The one where someone mentioned the budget\" actually works.",
  },
  {
    icon: "✎",
    title: "Built-in grammar agent",
    body: "Replaces Grammarly. Multi-language. Real-time. Included free — saves you $30/month.",
  },
  {
    icon: "◉",
    title: "Works while you sleep",
    body: "AI agent triages overnight, drafts replies, schedules sends. You approve in the morning with one tap.",
  },
  {
    icon: "⊞",
    title: "Every account, one inbox",
    body: "Gmail + Outlook + iCloud + IMAP. Unified AI across all of them. No other client does this.",
  },
  {
    icon: "↩",
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
  { name: "Dragon Professional", price: "$500+" },
] as const;

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white text-gray-900 font-sans">

      {/* ─── Nav ──────────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200/60">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="text-xl font-bold text-indigo-600 tracking-tight">
            AlecRae
          </span>
          <div className="flex items-center gap-3">
            <a
              href="/login"
              className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Sign in
            </a>
            <a
              href="/register"
              className="text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Get Early Access
            </a>
          </div>
        </div>
      </nav>

      {/* ─── Hero ─────────────────────────────────────────────────── */}
      <section className="pt-36 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 text-xs font-medium px-3 py-1.5 rounded-full mb-6 border border-indigo-200/60">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
            Now in early access
          </div>
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold text-gray-900 leading-[1.05] tracking-tight mb-6">
            Email for the{" "}
            <span className="text-indigo-600">AI era.</span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-500 leading-relaxed max-w-2xl mx-auto mb-10">
            The email client you&rsquo;d sign your name to. AI in every layer.
            One subscription replaces Gmail, Grammarly, Superhuman, and five other tools.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="/register"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200"
            >
              Get Early Access — Free
            </a>
            <a
              href="#features"
              className="inline-flex items-center justify-center px-6 py-3 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              See what&rsquo;s inside
            </a>
          </div>
        </div>
      </section>

      {/* ─── Social proof strip ───────────────────────────────────── */}
      <section className="border-y border-gray-100 bg-gray-50/60 py-5">
        <div className="max-w-5xl mx-auto px-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
          <span className="text-[11px] tracking-widest uppercase text-gray-400 font-medium">
            Replaces
          </span>
          {REPLACEMENTS.map((r) => (
            <span key={r.name} className="flex items-baseline gap-1.5">
              <span className="text-sm text-gray-700 font-medium">{r.name}</span>
              <span className="text-xs text-gray-400 line-through">{r.price}</span>
            </span>
          ))}
        </div>
      </section>

      {/* ─── Features grid ────────────────────────────────────────── */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight mb-3">
              What makes it different
            </h2>
            <p className="text-sm text-gray-500 uppercase tracking-widest">
              Not bolt-on AI. AI in every layer.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <article
                key={f.title}
                className="p-6 rounded-xl border border-gray-200 bg-white hover:border-indigo-200 hover:shadow-sm hover:shadow-indigo-100/50 transition-all"
              >
                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 text-base mb-4">
                  {f.icon}
                </div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Pricing ──────────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-gray-50/60 border-t border-gray-100">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight mb-3">
              Simple pricing
            </h2>
            <p className="text-sm text-gray-500 uppercase tracking-widest">
              One subscription replaces your entire stack
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Free */}
            <div className="rounded-xl border border-gray-200 bg-white p-7 flex flex-col">
              <p className="text-xs tracking-widest uppercase text-gray-500 font-medium mb-2">Free</p>
              <p className="text-3xl font-bold text-gray-900 mb-1">$0<span className="text-base font-normal text-gray-400">/mo</span></p>
              <p className="text-xs text-gray-400 mb-5">Get started, no card needed</p>
              <ul className="space-y-2.5 text-sm text-gray-600 flex-1">
                <li className="flex items-center gap-2"><span className="text-indigo-500">✓</span> 1 email account</li>
                <li className="flex items-center gap-2"><span className="text-indigo-500">✓</span> Basic AI (5 composes/day)</li>
                <li className="flex items-center gap-2"><span className="text-indigo-500">✓</span> 30-day search</li>
              </ul>
              <a href="/register" className="mt-6 block text-center text-sm font-medium border border-gray-300 text-gray-700 py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                Get started free
              </a>
            </div>

            {/* Personal — highlighted */}
            <div className="rounded-xl border-2 border-indigo-600 bg-indigo-600 p-7 flex flex-col relative">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-[10px] font-semibold tracking-widest uppercase px-4 py-1 rounded-full">
                Most popular
              </span>
              <p className="text-xs tracking-widest uppercase text-indigo-200 font-medium mb-2">Personal</p>
              <p className="text-3xl font-bold text-white mb-1">$9<span className="text-base font-normal text-indigo-300">/mo</span></p>
              <p className="text-xs text-indigo-300 mb-5">Billed monthly, cancel anytime</p>
              <ul className="space-y-2.5 text-sm text-indigo-100 flex-1">
                <li className="flex items-center gap-2"><span className="text-indigo-300">✓</span> 3 email accounts</li>
                <li className="flex items-center gap-2"><span className="text-indigo-300">✓</span> Full AI + voice profile</li>
                <li className="flex items-center gap-2"><span className="text-indigo-300">✓</span> Unlimited search</li>
                <li className="flex items-center gap-2"><span className="text-indigo-300">✓</span> E2E encryption</li>
                <li className="flex items-center gap-2"><span className="text-indigo-300">✓</span> Snooze + schedule send</li>
              </ul>
              <a href="/register" className="mt-6 block text-center text-sm font-semibold bg-white text-indigo-600 py-2.5 rounded-lg hover:bg-indigo-50 transition-colors">
                Get early access
              </a>
            </div>

            {/* Pro */}
            <div className="rounded-xl border border-gray-200 bg-white p-7 flex flex-col">
              <p className="text-xs tracking-widest uppercase text-gray-500 font-medium mb-2">Pro</p>
              <p className="text-3xl font-bold text-gray-900 mb-1">$19<span className="text-base font-normal text-gray-400">/mo</span></p>
              <p className="text-xs text-gray-400 mb-5">For power users & small teams</p>
              <ul className="space-y-2.5 text-sm text-gray-600 flex-1">
                <li className="flex items-center gap-2"><span className="text-indigo-500">✓</span> Unlimited accounts</li>
                <li className="flex items-center gap-2"><span className="text-indigo-500">✓</span> Priority AI (Sonnet)</li>
                <li className="flex items-center gap-2"><span className="text-indigo-500">✓</span> Team features</li>
                <li className="flex items-center gap-2"><span className="text-indigo-500">✓</span> API access</li>
                <li className="flex items-center gap-2"><span className="text-indigo-500">✓</span> Analytics</li>
              </ul>
              <a href="/register" className="mt-6 block text-center text-sm font-medium border border-gray-300 text-gray-700 py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                Get started
              </a>
            </div>
          </div>
          <p className="mt-6 text-center text-xs text-gray-400">
            Team plan: $12/user/mo · Enterprise: custom pricing with SLA and dedicated support
          </p>
        </div>
      </section>

      {/* ─── CTA ──────────────────────────────────────────────────── */}
      <section className="py-24 px-6 border-t border-gray-100">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 tracking-tight mb-4">
            Email, evolved.
          </h2>
          <p className="text-gray-500 mb-10 text-base leading-relaxed">
            Gmail is 22 years old. Outlook predates the iPhone. It&rsquo;s time
            for email that works the way you think.
          </p>
          <a
            href="/register"
            className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200"
          >
            Get Early Access — Free
          </a>
        </div>
      </section>

      {/* ─── Footer ───────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 py-10 px-6 bg-gray-50/40">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <span className="text-base font-bold text-indigo-600">AlecRae</span>
          <div className="flex gap-6">
            <a href="/terms" className="text-xs text-gray-400 hover:text-gray-700 transition-colors">Terms</a>
            <a href="/privacy" className="text-xs text-gray-400 hover:text-gray-700 transition-colors">Privacy</a>
            <a href="/security" className="text-xs text-gray-400 hover:text-gray-700 transition-colors">Security</a>
            <a href="/roadmap" className="text-xs text-gray-400 hover:text-gray-700 transition-colors">Roadmap</a>
            <a href="/admin" className="text-xs text-gray-400 hover:text-gray-700 transition-colors">Admin</a>
          </div>
          <span className="text-xs text-gray-400">&copy; 2026 AlecRae, Inc.</span>
        </div>
      </footer>

    </main>
  );
}
