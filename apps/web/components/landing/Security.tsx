"use client";

import { motion } from "motion/react";

const fadeUp = { initial: { opacity: 0, y: 30 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-100px" }, transition: { duration: 0.6 } };

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
    <section id="security" className="py-32 px-6 relative">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-emerald-500 rounded-full mix-blend-screen filter blur-[200px] opacity-[0.05]" />
      </div>

      <div className="max-w-5xl mx-auto relative z-10">
        <motion.div {...fadeUp} className="text-center mb-16">
          <p className="text-sm font-medium uppercase tracking-widest text-emerald-400 mb-4">Security & Privacy</p>
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-4">
            Your email is none of our business.
          </h2>
          <p className="text-lg text-blue-100/50 max-w-xl mx-auto">
            Privacy isn&apos;t a feature toggle. It&apos;s the architecture.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pledges.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: i * 0.06 }}
              className="p-6 rounded-2xl bg-white/[0.03] border border-white/10"
            >
              <div className="flex items-center gap-2 mb-3">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <h3 className="text-base font-semibold text-white">{p.title}</h3>
              </div>
              <p className="text-sm text-blue-100/50 leading-relaxed">{p.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
