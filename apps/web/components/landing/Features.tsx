import { Reveal } from "./Reveal";

const features = [
  {
    title: "AI Compose",
    desc: "Writes drafts that sound like you. Not a robot. Your vocabulary, your rhythm, your tone.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 20h9M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
  },
  {
    title: "Universal Inbox",
    desc: "Gmail, Outlook, iCloud, Yahoo, any IMAP — all unified under one intelligent inbox.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M22 12h-6l-2 3h-4l-2-3H2" />
        <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
      </svg>
    ),
  },
  {
    title: "Grammar Agent",
    desc: "Built-in grammar, tone, and clarity checking. Replaces standalone tools that cost $30/month.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
      </svg>
    ),
  },
  {
    title: "Voice Dictation",
    desc: "Email-aware voice commands with multi-language support. Say it, send it.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
        <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
      </svg>
    ),
  },
  {
    title: "Smart Inbox",
    desc: "AI triages your email overnight. Wake up to a sorted inbox with drafts ready to approve.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    title: "Email Recall",
    desc: "Actually works. Not the fake recall other providers pretend to offer.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M1 4v6h6M23 20v-6h-6" />
        <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
      </svg>
    ),
  },
  {
    title: "Sub-100ms Speed",
    desc: "Local-first architecture. Your inbox loads from device cache — instant, even offline.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
  },
  {
    title: "E2E Encryption",
    desc: "RSA-4096 + AES-256. Zero-knowledge architecture. We can't read your email. Nobody can.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
];

export function Features() {
  return (
    <section id="features" className="py-28 px-6 bg-white border-t border-[#e3dfd3]">
      <div className="max-w-6xl mx-auto">
        <Reveal className="text-center mb-16">
          <p className="text-xs uppercase tracking-[0.3em] text-[#9a7b4f] mb-5">Features</p>
          <h2 className="font-serif text-3xl md:text-5xl tracking-tight text-[#1c1a17] mb-5">
            Everything you need. Nothing you don&apos;t.
          </h2>
          <p className="text-lg text-[#6b6557] max-w-xl mx-auto">
            Every feature is built in — not bolted on. No plugins, no add-ons, no extra subscriptions.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map((f, i) => (
            <Reveal
              key={f.title}
              delay={i * 0.05}
              rootMargin="-50px"
              className="group p-7 rounded-2xl bg-[#f5f4ef] border border-[#e3dfd3] hover:border-[#1f3d2e]/30 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-[#1f3d2e]/[0.06] text-[#1f3d2e] flex items-center justify-center mb-5">
                {f.icon}
              </div>
              <h3 className="text-base font-semibold text-[#1c1a17] mb-2">{f.title}</h3>
              <p className="text-sm text-[#6b6557] leading-relaxed">{f.desc}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
