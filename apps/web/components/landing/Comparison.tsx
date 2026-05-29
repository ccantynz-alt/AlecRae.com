"use client";

import { motion } from "motion/react";

const fadeUp = { initial: { opacity: 0, y: 30 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-100px" }, transition: { duration: 0.6 } };

const stack = [
  { tool: "Email + AI assistant", theirPrice: "$12–30/mo", included: true },
  { tool: "Grammar & writing tool", theirPrice: "$12–30/mo", included: true },
  { tool: "Premium email client", theirPrice: "$30/mo", included: true },
  { tool: "Dictation software", theirPrice: "$15/mo", included: true },
  { tool: "Shared inbox tool", theirPrice: "$19–59/mo", included: true },
  { tool: "Encrypted email", theirPrice: "$5–10/mo", included: true },
  { tool: "Meeting transcription", theirPrice: "$10/mo", included: true },
];

export function Comparison() {
  return (
    <section className="py-32 px-6">
      <div className="max-w-4xl mx-auto">
        <motion.div {...fadeUp} className="text-center mb-16">
          <p className="text-sm font-medium uppercase tracking-widest text-emerald-400 mb-4">The math</p>
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-4">
            Replace your entire stack.
          </h2>
          <p className="text-lg text-blue-100/50 max-w-xl mx-auto">
            Stop paying seven subscriptions for things one app should do.
          </p>
        </motion.div>

        <motion.div {...fadeUp} className="rounded-2xl border border-white/10 overflow-hidden">
          <div className="grid grid-cols-3 gap-0 px-6 py-4 bg-white/[0.05] border-b border-white/10 text-sm font-medium">
            <div className="text-blue-100/50">Tool</div>
            <div className="text-center text-blue-100/50">Separate cost</div>
            <div className="text-center text-emerald-400">AlecRae</div>
          </div>
          {stack.map((item, i) => (
            <div key={i} className="grid grid-cols-3 gap-0 px-6 py-4 border-b border-white/5 last:border-b-0 hover:bg-white/[0.02] transition-colors">
              <div className="text-sm text-white">{item.tool}</div>
              <div className="text-center text-sm text-red-400/80 line-through">{item.theirPrice}</div>
              <div className="text-center text-sm text-emerald-400 font-medium">Included</div>
            </div>
          ))}
          <div className="grid grid-cols-3 gap-0 px-6 py-5 bg-white/[0.05] border-t border-white/10">
            <div className="text-white font-semibold">Total</div>
            <div className="text-center text-red-400 font-bold text-lg">$100+/mo</div>
            <div className="text-center text-emerald-400 font-bold text-lg">$9/mo</div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
