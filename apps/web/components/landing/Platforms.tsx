import { Reveal } from "./Reveal";

const platforms = [
  {
    name: "Web",
    desc: "Any browser, any device. Nothing to install.",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
      </svg>
    ),
  },
  {
    name: "Desktop",
    desc: "Native app for Mac, Windows, and Linux.",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
  },
  {
    name: "Mobile",
    desc: "iOS and Android with native performance.",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="5" y="2" width="14" height="20" rx="2" />
        <path d="M12 18h.01" />
      </svg>
    ),
  },
];

export function Platforms() {
  return (
    <section className="py-28 px-6 border-t border-[#e3dfd3]">
      <div className="max-w-4xl mx-auto">
        <Reveal className="text-center mb-16">
          <p className="text-xs uppercase tracking-[0.3em] text-[#9a7b4f] mb-5">Platforms</p>
          <h2 className="font-serif text-3xl md:text-5xl tracking-tight text-[#1c1a17] mb-5">
            Every device. One experience.
          </h2>
          <p className="text-lg text-[#6b6557] max-w-xl mx-auto">
            Start on your phone, finish on your desktop. Your inbox syncs everywhere.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {platforms.map((p, i) => (
            <Reveal
              key={p.name}
              delay={i * 0.1}
              rootMargin="0px"
              className="flex flex-col items-center text-center p-8 rounded-2xl bg-white border border-[#e3dfd3] hover:border-[#1f3d2e]/30 transition-colors"
            >
              <div className="w-16 h-16 rounded-full bg-[#1f3d2e]/[0.06] text-[#1f3d2e] flex items-center justify-center mb-5">
                {p.icon}
              </div>
              <h3 className="text-lg font-semibold text-[#1c1a17] mb-2">{p.name}</h3>
              <p className="text-sm text-[#6b6557]">{p.desc}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
