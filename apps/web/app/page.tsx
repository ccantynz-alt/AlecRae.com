/**
 * Vienna — Coming Soon Landing Page
 *
 * NO email signup. NO support contact. Just a holding page with the brand.
 * Will be replaced with full marketing site once support infrastructure is ready.
 */

export default function ComingSoonPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-white px-6">
      {/* Background ambient gradient blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-500 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-500 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-pulse" style={{ animationDelay: "1s" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500 rounded-full mix-blend-screen filter blur-3xl opacity-10 animate-pulse" style={{ animationDelay: "2s" }} />
      </div>

      <div className="relative z-10 flex flex-col items-center text-center max-w-3xl">
        {/* Logo / Wordmark */}
        <div className="mb-8">
          <h1 className="text-7xl md:text-9xl font-bold tracking-tighter bg-gradient-to-r from-white via-blue-200 to-cyan-300 bg-clip-text text-transparent">
            Vienna
          </h1>
        </div>

        {/* Tagline */}
        <p className="text-2xl md:text-4xl font-light text-blue-100 mb-4 tracking-tight">
          Email, finally.
        </p>

        {/* Coming Soon badge */}
        <div className="mt-8 mb-12 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white/10 backdrop-blur-md border border-white/20">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500" />
          </span>
          <span className="text-sm font-medium text-blue-100 tracking-wide uppercase">
            Coming Soon
          </span>
        </div>

        {/* Description */}
        <p className="text-lg md:text-xl text-blue-100/80 max-w-2xl leading-relaxed font-light">
          The fastest, smartest, most beautiful email client ever made.
          <br className="hidden md:block" />
          One subscription. All your accounts. AI in every layer.
        </p>

        {/* Feature highlights */}
        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl">
          <FeatureBadge title="AI-Native" subtitle="Built-in grammar, dictation, compose" />
          <FeatureBadge title="Universal" subtitle="Gmail, Outlook, IMAP, all your accounts" />
          <FeatureBadge title="Private" subtitle="E2E encryption, no ads, no tracking" />
          <FeatureBadge title="Instant" subtitle="Sub-100ms inbox, local-first" />
        </div>

        {/* Footer */}
        <div className="mt-24 text-sm text-blue-200/40 font-light">
          © 2026 Vienna. The reinvention of email.
        </div>
      </div>
    </main>
  );
}

function FeatureBadge({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center gap-1 p-4 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10 transition-colors">
      <div className="text-base font-semibold text-white">{title}</div>
      <div className="text-xs text-blue-200/70 text-center leading-tight">{subtitle}</div>
    </div>
  );
}
