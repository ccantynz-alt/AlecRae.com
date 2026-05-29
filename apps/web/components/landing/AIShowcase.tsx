"use client";

import { motion } from "motion/react";

const fadeUp = { initial: { opacity: 0, y: 30 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-100px" }, transition: { duration: 0.6 } };

const capabilities = [
  { title: "Overnight Agent", desc: "AI triages your inbox while you sleep. Wake up to a sorted inbox with reply drafts ready for one-tap approval.", gradient: "from-blue-500 to-cyan-500" },
  { title: "Voice Profile", desc: "AI learns your writing style — vocabulary, rhythm, formality. Every draft sounds like you, not a template.", gradient: "from-purple-500 to-pink-500" },
  { title: "Natural Language Search", desc: "\"Find the email where someone mentioned the budget for Q3\" — search by meaning, not just keywords.", gradient: "from-emerald-500 to-teal-500" },
  { title: "Newsletter Summaries", desc: "Every newsletter reduced to 3 bullets in your inbox preview. Full text on demand.", gradient: "from-amber-500 to-orange-500" },
  { title: "Commitment Tracker", desc: "AI catches every promise made in email. \"I'll send that by Friday\" — tracked automatically.", gradient: "from-red-500 to-rose-500" },
  { title: "Smart Unsubscribe", desc: "One click. AI navigates the unsubscribe page for you and confirms removal.", gradient: "from-indigo-500 to-violet-500" },
];

export function AIShowcase() {
  return (
    <section id="ai" className="py-32 px-6 relative">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-500 rounded-full mix-blend-screen filter blur-[200px] opacity-[0.07]" />
      </div>

      <div className="max-w-6xl mx-auto relative z-10">
        <motion.div {...fadeUp} className="text-center mb-16">
          <p className="text-sm font-medium uppercase tracking-widest text-purple-400 mb-4">AI Engine</p>
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-4">
            AI in every layer. Not bolted on.
          </h2>
          <p className="text-lg text-blue-100/50 max-w-xl mx-auto">
            Three-tier AI: free on-device inference, sub-50ms edge processing,
            full cloud power when you need it.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {capabilities.map((c, i) => (
            <motion.div
              key={c.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="group relative p-6 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition-all overflow-hidden"
            >
              <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r ${c.gradient} opacity-50 group-hover:opacity-100 transition-opacity`} />
              <h3 className="text-lg font-semibold text-white mb-3">{c.title}</h3>
              <p className="text-sm text-blue-100/50 leading-relaxed">{c.desc}</p>
            </motion.div>
          ))}
        </div>

        <motion.div {...fadeUp} className="mt-16 text-center">
          <div className="inline-flex flex-col sm:flex-row items-center gap-6 p-6 rounded-2xl bg-white/[0.03] border border-white/10">
            <div className="text-left">
              <div className="text-sm text-blue-200/40 mb-1">On-device AI</div>
              <div className="text-white font-semibold">$0/token</div>
              <div className="text-xs text-blue-200/30">Runs on your GPU</div>
            </div>
            <div className="w-px h-12 bg-white/10 hidden sm:block" />
            <div className="text-left">
              <div className="text-sm text-blue-200/40 mb-1">Edge AI</div>
              <div className="text-white font-semibold">&lt;50ms</div>
              <div className="text-xs text-blue-200/30">330+ global locations</div>
            </div>
            <div className="w-px h-12 bg-white/10 hidden sm:block" />
            <div className="text-left">
              <div className="text-sm text-blue-200/40 mb-1">Cloud AI</div>
              <div className="text-white font-semibold">Full power</div>
              <div className="text-xs text-blue-200/30">H100 GPUs on demand</div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
