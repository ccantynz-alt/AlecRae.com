"use client";

import { motion } from "motion/react";
import { useState, useEffect } from "react";

function TypingDemo(): React.ReactNode {
  const lines = [
    "Hey Sarah,",
    "",
    "Thanks for sending over the Q3 numbers.",
    "I've reviewed the revenue breakdown and",
    "everything looks solid. Let's sync tomorrow",
    "to discuss the projections for Q4.",
    "",
    "Best,",
    "Alex",
  ];

  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisibleLines((prev: number) => {
        if (prev >= lines.length) {
          setTimeout(() => setVisibleLines(0), 2000);
          return prev;
        }
        return prev + 1;
      });
    }, 400);
    return () => clearInterval(interval);
  }, [lines.length]);

  return (
    <div className="bg-[#0c0c14] rounded-xl border border-white/[0.06] p-4 text-[13px] text-white/60 font-mono leading-relaxed h-full">
      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-white/[0.06]">
        <div className="w-2 h-2 rounded-full bg-violet-400" />
        <span className="text-[11px] text-violet-300/60 font-sans font-medium">AI composing in your voice...</span>
      </div>
      {lines.slice(0, visibleLines).map((line, i) => (
        <div key={i} className={line === "" ? "h-4" : ""}>
          {line}
          {i === visibleLines - 1 && (
            <span className="animate-typing-cursor text-violet-400 ml-0.5">|</span>
          )}
        </div>
      ))}
    </div>
  );
}

function SpeedGauge(): React.ReactNode {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
          <motion.circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="url(#speed-gradient)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={264}
            initial={{ strokeDashoffset: 264 }}
            whileInView={{ strokeDashoffset: 30 }}
            viewport={{ once: true }}
            transition={{ duration: 1.5, delay: 0.3, ease: "easeOut" }}
          />
          <defs>
            <linearGradient id="speed-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#a78bfa" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-2xl font-bold text-white tracking-tight">&lt;50</div>
            <div className="text-[9px] text-white/30 uppercase tracking-wider">ms</div>
          </div>
        </div>
      </div>
      <span className="text-[11px] text-white/30 font-medium">Inbox load time</span>
    </div>
  );
}

function AccountLogos(): React.ReactNode {
  const providers = [
    { name: "Gmail", color: "#ea4335", letter: "G" },
    { name: "Outlook", color: "#0078d4", letter: "O" },
    { name: "iCloud", color: "#999", letter: "iC" },
    { name: "Yahoo", color: "#7b0099", letter: "Y" },
    { name: "IMAP", color: "#06b6d4", letter: "IM" },
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <div className="flex -space-x-2">
        {providers.map((p, i) => (
          <motion.div
            key={p.name}
            initial={{ scale: 0, x: -20 }}
            whileInView={{ scale: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 + i * 0.1 }}
            className="w-10 h-10 rounded-full flex items-center justify-center text-[11px] font-bold text-white border-2 border-[#0a0a0f] relative"
            style={{ backgroundColor: p.color + "33", zIndex: providers.length - i }}
          >
            {p.letter}
          </motion.div>
        ))}
      </div>
      <span className="text-[11px] text-white/30 font-medium">All your accounts. One inbox.</span>
    </div>
  );
}

function WaveformViz(): React.ReactNode {
  const bars = 20;
  return (
    <div className="flex items-end justify-center gap-[3px] h-12">
      {Array.from({ length: bars }).map((_, i) => {
        const height = 8 + Math.sin(i * 0.8) * 20 + Math.random() * 15;
        return (
          <motion.div
            key={i}
            className="w-[3px] rounded-full bg-gradient-to-t from-violet-500/40 to-violet-400/80"
            initial={{ height: 4 }}
            whileInView={{ height }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.03, type: "spring", stiffness: 200 }}
          />
        );
      })}
    </div>
  );
}

const bentoItems = [
  {
    id: "compose",
    title: "AI Compose",
    desc: "Drafts that sound like you. Your vocabulary, rhythm, tone — learned from your writing.",
    size: "col-span-2 row-span-2",
    gradient: "from-violet-500/10 to-fuchsia-500/10",
    border: "border-violet-500/15 hover:border-violet-500/30",
    demo: "typing",
  },
  {
    id: "speed",
    title: "Sub-50ms",
    desc: "Local-first. Instant, even offline.",
    size: "col-span-1 row-span-1",
    gradient: "from-cyan-500/10 to-blue-500/10",
    border: "border-cyan-500/15 hover:border-cyan-500/30",
    demo: "speed",
  },
  {
    id: "accounts",
    title: "Universal Inbox",
    desc: "Every provider, unified.",
    size: "col-span-1 row-span-1",
    gradient: "from-blue-500/10 to-indigo-500/10",
    border: "border-blue-500/15 hover:border-blue-500/30",
    demo: "accounts",
  },
  {
    id: "grammar",
    title: "Grammar Agent",
    desc: "Built-in writing assistant. Replaces $30/mo tools.",
    size: "col-span-1 row-span-1",
    gradient: "from-emerald-500/10 to-teal-500/10",
    border: "border-emerald-500/15 hover:border-emerald-500/30",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-emerald-400">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
      </svg>
    ),
  },
  {
    id: "voice",
    title: "Voice Dictation",
    desc: "Email-aware commands. Multi-language.",
    size: "col-span-1 row-span-1",
    gradient: "from-purple-500/10 to-violet-500/10",
    border: "border-purple-500/15 hover:border-purple-500/30",
    demo: "waveform",
  },
  {
    id: "encryption",
    title: "E2E Encryption",
    desc: "RSA-4096 + AES-256. Zero-knowledge.",
    size: "col-span-1 row-span-1",
    gradient: "from-green-500/10 to-emerald-500/10",
    border: "border-green-500/15 hover:border-green-500/30",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-green-400">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    id: "recall",
    title: "Email Recall",
    desc: "Actually works. Unlike Outlook's theater.",
    size: "col-span-1 row-span-1",
    gradient: "from-rose-500/10 to-red-500/10",
    border: "border-rose-500/15 hover:border-rose-500/30",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-rose-400">
        <path d="M1 4v6h6M23 20v-6h-6" />
        <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
      </svg>
    ),
  },
  {
    id: "smart",
    title: "Smart Inbox",
    desc: "AI sorts overnight. Wake up organized.",
    size: "col-span-1 row-span-1",
    gradient: "from-amber-500/10 to-orange-500/10",
    border: "border-amber-500/15 hover:border-amber-500/30",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-400">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    ),
  },
];

export function Features(): React.ReactNode {
  return (
    <section id="features" className="py-32 px-6 relative">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
      </div>

      <div className="max-w-6xl mx-auto">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-xs text-violet-300/80 font-medium mb-8">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-violet-400">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            Everything built in
          </div>
          <h2 className="text-4xl md:text-6xl font-bold tracking-tighter text-white mb-5">
            One app.{" "}
            <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
              Zero plugins.
            </span>
          </h2>
          <p className="text-lg text-white/35 max-w-xl mx-auto">
            Every feature is native. Not an add-on, not an integration, not an extra $10/month.
          </p>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 auto-rows-[180px]">
          {bentoItems.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, margin: "-30px" }}
              transition={{ duration: 0.5, delay: i * 0.05, type: "spring", stiffness: 150 }}
              className={`group relative p-5 rounded-2xl bg-gradient-to-b ${item.gradient} border ${item.border} transition-all hover:shadow-lg hover:shadow-violet-500/5 overflow-hidden ${item.size}`}
            >
              <div className="relative z-10 h-full flex flex-col">
                <h3 className="text-sm font-semibold text-white mb-1">{item.title}</h3>
                <p className="text-[12px] text-white/35 leading-relaxed mb-3">{item.desc}</p>
                <div className="flex-1 flex items-center justify-center">
                  {item.demo === "typing" && <TypingDemo />}
                  {item.demo === "speed" && <SpeedGauge />}
                  {item.demo === "accounts" && <AccountLogos />}
                  {item.demo === "waveform" && <WaveformViz />}
                  {item.icon && (
                    <div className="opacity-40 group-hover:opacity-70 group-hover:scale-110 transition-all">
                      {item.icon}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
