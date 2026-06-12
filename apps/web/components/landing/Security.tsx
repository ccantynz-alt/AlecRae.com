import { Reveal } from "./Reveal";

const pledges = [
  { title: "No ads. Ever.", desc: "We make money from subscriptions, not surveillance. Your inbox is yours." },
  { title: "No data mining. Ever.", desc: "We don't read your emails for ad targeting. We don't sell your data. Period." },
  { title: "No third-party trackers.", desc: "Zero analytics scripts that send your behavior to advertising networks." },
  { title: "E2E encryption.", desc: "RSA-OAEP-4096 + AES-256-GCM. Zero-knowledge architecture. We cannot read encrypted mail." },
  { title: "TLS 1.3 minimum.", desc: "Every connection encrypted. No exceptions. No downgrades." },
  { title: "Passkey-first auth.", desc: "FIDO2 WebAuthn by default. 98% login success rate vs 13.8% for passwords." },
];

export function Security() {
  return (
    <section id="security" className="py-28 px-6 bg-white border-t border-[#e3dfd3]">
      <div className="max-w-5xl mx-auto">
        <Reveal className="text-center mb-16">
          <p className="text-xs uppercase tracking-[0.3em] text-[#9a7b4f] mb-5">Privacy &amp; Security</p>
          <h2 className="font-serif text-3xl md:text-5xl tracking-tight text-[#1c1a17] mb-5">
            Your email is none of our business.
          </h2>
          <p className="text-lg text-[#6b6557] max-w-xl mx-auto">
            Privacy isn&apos;t a feature toggle. It&apos;s the architecture.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pledges.map((p, i) => (
            <Reveal
              key={p.title}
              delay={i * 0.06}
              rootMargin="-50px"
              className="p-7 rounded-2xl bg-[#f5f4ef] border border-[#e3dfd3]"
            >
              <div className="flex items-center gap-2.5 mb-3">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[#1f3d2e]">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <h3 className="text-base font-semibold text-[#1c1a17]">{p.title}</h3>
              </div>
              <p className="text-sm text-[#6b6557] leading-relaxed">{p.desc}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
