"use client";

import { motion, useInView } from "motion/react";
import { useRef, useState, useEffect } from "react";

const stack = [
  { tool: "Email + AI assistant", theirPrice: "$12-30/mo", icon: "M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" },
  { tool: "Grammar & writing tool", theirPrice: "$12-30/mo", icon: "M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" },
  { tool: "Premium email client", theirPrice: "$30/mo", icon: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" },
  { tool: "Dictation software", theirPrice: "$15/mo", icon: "M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" },
  { tool: "Shared inbox tool", theirPrice: "$19-59/mo", icon: "M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" },
  { tool: "Encrypted email", theirPrice: "$5-10/mo", icon: "M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" },
  { tool: "Meeting transcription", theirPrice: "$10/mo", icon: "M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" },
];

function CheckIcon(): React.ReactNode {
  return (
    <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function ComparisonRow({ item, index }: { item: typeof stack[number]; index: number }): React.ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const [showCheck, setShowCheck] = useState(false);

  useEffect(() => {
    if (isInView) {
      const timer = setTimeout(() => setShowCheck(true), 400 + index * 120);
      return () => clearTimeout(timer);
    }
  }, [isInView, index]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: -40 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{
        duration: 0.5,
        delay: index * 0.08,
        type: "spring",
        stiffness: 120,
        damping: 20,
      }}
      className="group grid grid-cols-[1fr_140px_120px] sm:grid-cols-3 items-center gap-2 px-5 sm:px-6 py-4 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.03] transition-colors duration-200"
    >
      {/* Tool name */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0 group-hover:border-white/[0.12] transition-colors">
          <svg className="w-4 h-4 text-white/40 group-hover:text-white/60 transition-colors" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
          </svg>
        </div>
        <span className="text-sm font-medium text-white/80">{item.tool}</span>
      </div>

      {/* Their price */}
      <div className="text-center">
        <span className="text-sm text-rose-400/70 line-through decoration-rose-500/40">{item.theirPrice}</span>
      </div>

      {/* AlecRae included */}
      <div className="flex items-center justify-center gap-1.5">
        {showCheck ? (
          <motion.div
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 15, mass: 0.8 }}
            className="flex items-center gap-1.5"
          >
            <CheckIcon />
            <span className="text-sm font-medium text-emerald-400/90 hidden sm:inline">Included</span>
          </motion.div>
        ) : (
          <div className="w-5 h-5" />
        )}
      </div>
    </motion.div>
  );
}

function TotalRow(): React.ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-30px" });
  const [phase, setPhase] = useState<"initial" | "strike" | "reveal">("initial");

  useEffect(() => {
    if (isInView) {
      const t1 = setTimeout(() => setPhase("strike"), 900);
      const t2 = setTimeout(() => setPhase("reveal"), 1500);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [isInView]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: 0.6 }}
      className="grid grid-cols-[1fr_140px_120px] sm:grid-cols-3 items-center gap-2 px-5 sm:px-6 py-6 bg-gradient-to-r from-emerald-500/[0.06] via-emerald-500/[0.03] to-transparent border-t border-emerald-500/10"
    >
      <div className="text-white font-bold text-base">Total</div>

      {/* Competitor total */}
      <div className="text-center relative">
        <motion.span
          animate={
            phase === "strike"
              ? { scale: 0.9, opacity: 0.5 }
              : phase === "reveal"
                ? { scale: 0.75, opacity: 0.35 }
                : { scale: 1, opacity: 1 }
          }
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
          className="inline-block text-lg font-bold text-rose-400 line-through decoration-2 decoration-rose-500/60"
        >
          $100+/mo
        </motion.span>
      </div>

      {/* AlecRae total */}
      <div className="text-center">
        <motion.span
          animate={
            phase === "reveal"
              ? { scale: 1, opacity: 1 }
              : { scale: 0.8, opacity: 0.6 }
          }
          transition={{ type: "spring", stiffness: 300, damping: 12, mass: 0.8 }}
          className="inline-block text-2xl sm:text-3xl font-bold text-emerald-400"
        >
          $9/mo
        </motion.span>
      </div>
    </motion.div>
  );
}

export function Comparison(): React.ReactNode {
  return (
    <section className="py-32 px-6 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute bottom-1/3 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-emerald-600 rounded-full mix-blend-screen filter blur-[250px] opacity-[0.04]" />
      </div>

      <div className="max-w-4xl mx-auto relative z-10">
        {/* Divider */}
        <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent mb-20" />

        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="flex justify-center mb-6"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <svg className="w-3.5 h-3.5 text-emerald-300/80" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V13.5zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V18zm2.498-6.75h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V13.5zm0 2.25h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V18zm2.504-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V18zm2.498-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zM8.25 6h7.5v2.25h-7.5V6zM12 2.25c-1.892 0-3.758.11-5.593.322C5.307 2.7 4.5 3.65 4.5 4.757V19.5a2.25 2.25 0 002.25 2.25h10.5a2.25 2.25 0 002.25-2.25V4.757c0-1.108-.806-2.057-1.907-2.185A48.507 48.507 0 0012 2.25z" />
            </svg>
            <span className="text-xs font-medium text-emerald-300/80 tracking-wide">The math</span>
          </div>
        </motion.div>

        {/* Headline */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-center mb-4"
        >
          <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold tracking-tighter text-white">
            Replace your{" "}
            <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              entire stack.
            </span>
          </h2>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-center text-base md:text-lg text-white/35 max-w-xl mx-auto mb-14"
        >
          Stop paying seven subscriptions for things one app should do.
        </motion.p>

        {/* Comparison table */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="rounded-2xl border border-white/[0.08] overflow-hidden backdrop-blur-sm"
        >
          {/* Table header */}
          <div className="grid grid-cols-[1fr_140px_120px] sm:grid-cols-3 gap-2 px-5 sm:px-6 py-4 bg-white/[0.03] border-b border-white/[0.06]">
            <div className="text-xs font-medium text-white/30 uppercase tracking-wider">Tool</div>
            <div className="text-center text-xs font-medium text-white/30 uppercase tracking-wider">Separate</div>
            <div className="text-center text-xs font-medium text-emerald-400/60 uppercase tracking-wider">AlecRae</div>
          </div>

          {/* Rows */}
          {stack.map((item, i) => (
            <ComparisonRow key={item.tool} item={item} index={i} />
          ))}

          {/* Total row */}
          <TotalRow />
        </motion.div>

        {/* Bottom note */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="text-center text-sm text-white/20 mt-6"
        >
          Personal plan. Pro at $19/mo. Team at $12/user/mo. Free tier available.
        </motion.p>
      </div>
    </section>
  );
}
