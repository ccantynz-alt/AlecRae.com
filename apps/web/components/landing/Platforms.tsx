"use client";

import { motion } from "motion/react";

const fadeUp = { initial: { opacity: 0, y: 30 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-100px" }, transition: { duration: 0.6 } };

const platforms = [
  {
    name: "Web",
    desc: "Any browser, any device. Nothing to install.",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-blue-400">
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
      </svg>
    ),
  },
  {
    name: "Desktop",
    desc: "Native app for Mac, Windows, and Linux.",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-cyan-400">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
  },
  {
    name: "Mobile",
    desc: "iOS and Android with native performance.",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-purple-400">
        <rect x="5" y="2" width="14" height="20" rx="2" />
        <path d="M12 18h.01" />
      </svg>
    ),
  },
];

export function Platforms() {
  return (
    <section className="py-32 px-6">
      <div className="max-w-4xl mx-auto">
        <motion.div {...fadeUp} className="text-center mb-16">
          <p className="text-sm font-medium uppercase tracking-widest text-blue-400 mb-4">Platforms</p>
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-4">
            Every device. One experience.
          </h2>
          <p className="text-lg text-blue-100/50 max-w-xl mx-auto">
            Start on your phone, finish on your desktop. Your inbox syncs everywhere.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {platforms.map((p, i) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="flex flex-col items-center text-center p-8 rounded-2xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] transition-all"
            >
              <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                {p.icon}
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">{p.name}</h3>
              <p className="text-sm text-blue-100/50">{p.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
