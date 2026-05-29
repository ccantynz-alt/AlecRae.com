"use client";

import { motion } from "motion/react";

const fadeUp = { initial: { opacity: 0, y: 30 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-100px" }, transition: { duration: 0.6 } };

const products = [
  {
    name: "AlecRae Chat",
    tagline: "No Slack tab. No missed context.",
    desc: "Channels, DMs, and conversations linked directly to email threads. Your team stays in sync without switching apps.",
    gradient: "from-blue-500 to-cyan-500",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-blue-400">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    ),
  },
  {
    name: "AlecRae Docs",
    tagline: "Documents that know your email.",
    desc: "Create, collaborate, and share documents with AI as your co-author. Summaries, rewrites, and exports — all in one place.",
    gradient: "from-purple-500 to-violet-500",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-purple-400">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
      </svg>
    ),
  },
  {
    name: "AlecRae Meet",
    tagline: "Meetings with AI summaries by default.",
    desc: "One-click video rooms. Every meeting is auto-transcribed. Summaries and action items land in your inbox before the call ends.",
    gradient: "from-emerald-500 to-teal-500",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-emerald-400">
        <path d="M23 7l-7 5 7 5V7z" />
        <rect x="1" y="5" width="15" height="14" rx="2" />
      </svg>
    ),
  },
  {
    name: "AlecRae Files",
    tagline: "Every attachment. One search.",
    desc: "All attachments across all your accounts — unified, indexed, and instantly searchable. No more digging through threads.",
    gradient: "from-amber-500 to-orange-500",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-400">
        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
      </svg>
    ),
  },
  {
    name: "AlecRae Notes",
    tagline: "Capture thoughts in context.",
    desc: "Notes linked directly to email threads and contacts. What you need to remember stays where you'll remember to look.",
    gradient: "from-pink-500 to-rose-500",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-pink-400">
        <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
  },
  {
    name: "AlecRae Calendar",
    tagline: "AI scheduling that actually works.",
    desc: "Smart availability detection, one-click meeting proposals, and conflict resolution — all from within your email.",
    gradient: "from-indigo-500 to-blue-500",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-indigo-400">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
  },
];

export function ProductSuite() {
  return (
    <section className="py-32 px-6 relative">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 right-0 w-[600px] h-[600px] bg-cyan-500 rounded-full mix-blend-screen filter blur-[200px] opacity-[0.05]" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-purple-500 rounded-full mix-blend-screen filter blur-[200px] opacity-[0.05]" />
      </div>

      <div className="max-w-6xl mx-auto relative z-10">
        <motion.div {...fadeUp} className="text-center mb-16">
          <p className="text-sm font-medium uppercase tracking-widest text-cyan-400 mb-4">The Platform</p>
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-4">
            Email is the hub.{" "}
            <span className="bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent">
              Everything orbits it.
            </span>
          </h2>
          <p className="text-lg text-blue-100/50 max-w-2xl mx-auto">
            AlecRae is not just a better inbox. It&apos;s a complete workspace built around email — with every tool your team needs, all talking to each other via AI.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((p, i) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="group relative p-6 rounded-2xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.05] hover:border-white/20 transition-all overflow-hidden"
            >
              <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r ${p.gradient} opacity-40 group-hover:opacity-100 transition-opacity`} />
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                {p.icon}
              </div>
              <h3 className="text-base font-semibold text-white mb-1">{p.name}</h3>
              <p className="text-sm font-medium text-blue-300/60 mb-3">{p.tagline}</p>
              <p className="text-sm text-blue-100/45 leading-relaxed">{p.desc}</p>
            </motion.div>
          ))}
        </div>

        <motion.div {...fadeUp} className="mt-12 text-center">
          <p className="text-sm text-blue-100/30">
            All platform tools are included in every paid plan. No separate app subscriptions.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
