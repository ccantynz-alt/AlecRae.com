"use client";

import { motion } from "motion/react";

const pledges = [
  {
    title: "No ads. Ever.",
    desc: "We make money from subscriptions, not surveillance.",
  },
  {
    title: "No data mining.",
    desc: "We don’t read your emails for ad targeting.",
  },
  {
    title: "No third-party trackers.",
    desc: "Zero analytics scripts that phone home.",
  },
  {
    title: "E2E encryption.",
    desc: "RSA-4096 + AES-256. Zero-knowledge architecture.",
  },
  {
    title: "TLS 1.3 minimum.",
    desc: "Every connection encrypted. No exceptions.",
  },
  {
    title: "Passkey-first auth.",
    desc: "FIDO2 WebAuthn. 98% login success rate.",
  },
];

export function Security(): React.ReactNode {
  return (
    <section id="security" className="relative py-32 px-6">
      <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-emerald-500 rounded-full mix-blend-screen filter blur-[250px] opacity-[0.04]" />
        <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] bg-emerald-600 rounded-full mix-blend-screen filter blur-[200px] opacity-[0.03]" />
      </div>

      <div className="max-w-5xl mx-auto relative z-10 pt-24">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-6">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-emerald-300/80"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span className="text-xs font-medium text-emerald-300/80 tracking-wide">
              Security & Privacy
            </span>
          </div>

          <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold tracking-tighter text-white mb-5">
            Your email is{" "}
            <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              none of our business.
            </span>
          </h2>
          <p className="text-lg text-white/35 max-w-xl mx-auto">
            Privacy isn&apos;t a feature toggle. It&apos;s the architecture.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {pledges.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{
                type: "spring",
                stiffness: 100,
                damping: 15,
                delay: i * 0.08,
              }}
              className="group p-6 rounded-2xl bg-gradient-to-b from-emerald-500/[0.06] to-emerald-500/[0.02] border border-emerald-500/[0.12] hover:border-emerald-500/25 transition-all hover:-translate-y-0.5"
            >
              <div className="flex items-center gap-2.5 mb-3">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-emerald-400 flex-shrink-0"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <h3 className="text-base font-semibold text-white">
                  {p.title}
                </h3>
              </div>
              <p className="text-sm text-white/35 leading-relaxed">{p.desc}</p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="mt-14 p-5 rounded-2xl bg-gradient-to-r from-emerald-500/[0.05] via-emerald-500/[0.08] to-emerald-500/[0.05] border border-emerald-500/[0.12]"
        >
          <div className="flex items-center justify-center gap-3">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-emerald-400 flex-shrink-0"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <p className="text-sm text-white/40 text-center">
              Built on zero-trust architecture.{" "}
              <span className="text-emerald-400/80 font-medium">
                We can&apos;t read your email
              </span>{" "}
              — even if we wanted to.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
