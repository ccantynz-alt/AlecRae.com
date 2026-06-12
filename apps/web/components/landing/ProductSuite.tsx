import { Reveal } from "./Reveal";

const products = [
  {
    name: "AlecRae Chat",
    tagline: "No Slack tab. No missed context.",
    desc: "Channels, DMs, and conversations linked directly to email threads. Your team stays in sync without switching apps.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    ),
  },
  {
    name: "AlecRae Docs",
    tagline: "Documents that know your email.",
    desc: "Create, collaborate, and share documents with AI as your co-author. Summaries, rewrites, and exports — all in one place.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
      </svg>
    ),
  },
  {
    name: "AlecRae Meet",
    tagline: "Meetings with AI summaries by default.",
    desc: "One-click video rooms. Every meeting is auto-transcribed. Summaries and action items land in your inbox before the call ends.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M23 7l-7 5 7 5V7z" />
        <rect x="1" y="5" width="15" height="14" rx="2" />
      </svg>
    ),
  },
  {
    name: "AlecRae Files",
    tagline: "Every attachment. One search.",
    desc: "All attachments across all your accounts — unified, indexed, and instantly searchable. No more digging through threads.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
      </svg>
    ),
  },
  {
    name: "AlecRae Notes",
    tagline: "Capture thoughts in context.",
    desc: "Notes linked directly to email threads and contacts. What you need to remember stays where you'll remember to look.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
  },
  {
    name: "AlecRae Calendar",
    tagline: "AI scheduling that actually works.",
    desc: "Smart availability detection, one-click meeting proposals, and conflict resolution — all from within your email.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
  },
];

export function ProductSuite() {
  return (
    <section className="py-28 px-6 border-t border-[#e3dfd3]">
      <div className="max-w-6xl mx-auto">
        <Reveal className="text-center mb-16">
          <p className="text-xs uppercase tracking-[0.3em] text-[#9a7b4f] mb-5">The Platform</p>
          <h2 className="font-serif text-3xl md:text-5xl tracking-tight text-[#1c1a17] mb-5">
            Email is the hub. Everything orbits it.
          </h2>
          <p className="text-lg text-[#6b6557] max-w-2xl mx-auto">
            AlecRae is not just a better inbox. It&apos;s a complete workspace built around email
            — with every tool your team needs, all talking to each other.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((p, i) => (
            <Reveal
              key={p.name}
              delay={i * 0.08}
              rootMargin="-50px"
              className="p-7 rounded-2xl bg-white border border-[#e3dfd3] hover:border-[#1f3d2e]/30 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-[#1f3d2e]/[0.06] text-[#1f3d2e] flex items-center justify-center mb-5">
                {p.icon}
              </div>
              <h3 className="text-base font-semibold text-[#1c1a17] mb-1">{p.name}</h3>
              <p className="text-sm font-medium text-[#9a7b4f] mb-3">{p.tagline}</p>
              <p className="text-sm text-[#6b6557] leading-relaxed">{p.desc}</p>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-12 text-center">
          <p className="text-sm text-[#8a8475]">
            All platform tools are included in every paid plan. No separate app subscriptions.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
