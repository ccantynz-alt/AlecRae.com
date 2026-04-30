"use client";

import { motion } from "motion/react";

const platforms = [
  {
    name: "Web",
    desc: "Any browser, any OS. Nothing to install, nothing to update. Just open and go.",
    tag: "PWA",
    tagColor: "text-blue-300/70 bg-blue-500/10 border-blue-500/20",
    iconColor: "text-blue-400",
    glowColor: "bg-blue-500/20",
    gradient: "from-blue-500/10 to-blue-500/5",
    border: "border-blue-500/15 hover:border-blue-500/30",
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-blue-400">
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
      </svg>
    ),
  },
  {
    name: "Desktop",
    desc: "Native app for Mac, Windows, and Linux. System tray, notifications, offline access.",
    tag: "Electron + Tauri",
    tagColor: "text-cyan-300/70 bg-cyan-500/10 border-cyan-500/20",
    iconColor: "text-cyan-400",
    glowColor: "bg-cyan-500/20",
    gradient: "from-cyan-500/10 to-cyan-500/5",
    border: "border-cyan-500/15 hover:border-cyan-500/30",
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-cyan-400">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
  },
  {
    name: "Mobile",
    desc: "iOS and Android with native performance. Gesture navigation, push notifications, biometrics.",
    tag: "React Native",
    tagColor: "text-purple-300/70 bg-purple-500/10 border-purple-500/20",
    iconColor: "text-purple-400",
    glowColor: "bg-purple-500/20",
    gradient: "from-purple-500/10 to-purple-500/5",
    border: "border-purple-500/15 hover:border-purple-500/30",
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-purple-400">
        <rect x="5" y="2" width="14" height="20" rx="2" />
        <path d="M12 18h.01" />
      </svg>
    ),
  },
];

export function Platforms(): React.ReactNode {
  return (
    <section className="py-32 px-6 relative">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
      </div>

      <div className="max-w-5xl mx-auto relative z-10">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300/80 font-medium mb-8">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-blue-400">
              <path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
            Everywhere
          </div>
          <h2 className="text-4xl md:text-6xl font-bold tracking-tighter text-white mb-5">
            Every device.{" "}
            <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              One experience.
            </span>
          </h2>
          <p className="text-lg text-white/35 max-w-xl mx-auto">
            Your inbox is everywhere you are. Seamless, synced, and instant.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {platforms.map((p, i) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, margin: "-30px" }}
              transition={{ type: "spring", stiffness: 150, damping: 20, delay: i * 0.1 }}
              className={`group relative flex flex-col items-center text-center p-8 rounded-2xl bg-gradient-to-b ${p.gradient} border ${p.border} transition-all hover:shadow-lg hover:shadow-violet-500/5 overflow-hidden`}
            >
              <div className="relative w-20 h-20 rounded-2xl bg-white/[0.04] flex items-center justify-center mb-5">
                <div className={`absolute inset-0 rounded-2xl ${p.glowColor} blur-xl opacity-0 group-hover:opacity-60 transition-opacity duration-500`} />
                <div className="relative z-10 group-hover:scale-110 transition-transform duration-300">
                  {p.icon}
                </div>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">{p.name}</h3>
              <p className="text-sm text-white/35 leading-relaxed mb-4">{p.desc}</p>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium border ${p.tagColor}`}>
                {p.tag}
              </span>
            </motion.div>
          ))}
        </div>

        <motion.p
          className="text-center text-sm text-white/30 mt-12 max-w-lg mx-auto leading-relaxed"
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          Start on your phone, finish on your desktop. Your inbox follows you everywhere.
        </motion.p>
      </div>
    </section>
  );
}
