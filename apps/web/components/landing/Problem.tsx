"use client";

import { motion, useInView } from "motion/react";
import { useRef, useState, useEffect } from "react";

function AnimatedCounter({ target, suffix = "", prefix = "" }: { target: number; suffix?: string; prefix?: string }): React.ReactNode {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const duration = 1500;
    const startTime = performance.now();

    const tick = (now: number): void => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      start = Math.round(eased * target);
      setCount(start);
      if (progress < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }, [inView, target]);

  return (
    <span ref={ref}>
      {prefix}{count}{suffix}
    </span>
  );
}

const painPoints = [
  { icon: "💸", stat: "$100+", label: "per month on tools that should be one app", color: "from-red-500/20 to-orange-500/20", borderColor: "border-red-500/20" },
  { icon: "🧩", stat: "5+", label: "separate subscriptions for email basics", color: "from-amber-500/20 to-yellow-500/20", borderColor: "border-amber-500/20" },
  { icon: "🤖", stat: "0", label: "tools that actually learn how you write", color: "from-violet-500/20 to-blue-500/20", borderColor: "border-violet-500/20" },
];

export function Problem(): React.ReactNode {
  return (
    <section className="py-32 px-6 relative">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
      </div>

      <div className="max-w-5xl mx-auto">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-xs text-red-300/80 font-medium mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
            The problem nobody fixed
          </div>

          <h2 className="text-4xl md:text-6xl font-bold tracking-tighter text-white mb-6 leading-[0.9]">
            Email hasn&apos;t changed
            <br />
            <span className="bg-gradient-to-r from-red-400 via-orange-400 to-amber-400 bg-clip-text text-transparent">
              since you were in school.
            </span>
          </h2>

          <p className="text-lg text-white/35 max-w-2xl mx-auto leading-relaxed">
            Gmail launched in 2004. You&apos;re still using the same interface, patching it with
            a grammar checker here, a scheduling tool there, an AI sidebar you never open.
            <br />
            <span className="text-white/50 font-medium">Paying $100+/month for tools that don&apos;t talk to each other.</span>
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {painPoints.map((point, i) => (
            <motion.div
              key={point.label}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className={`group relative p-8 rounded-2xl bg-gradient-to-b ${point.color} border ${point.borderColor} hover:scale-[1.02] transition-transform cursor-default`}
            >
              <div className="text-3xl mb-4">{point.icon}</div>
              <div className="text-5xl font-bold text-white mb-3 tracking-tight">{point.stat}</div>
              <div className="text-sm text-white/40 leading-relaxed">{point.label}</div>
            </motion.div>
          ))}
        </div>

        <motion.div
          className="mt-16 text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <p className="text-white/25 text-sm">
            What if one app did all of it?{" "}
            <a href="#features" className="text-violet-400/70 hover:text-violet-300 transition-colors font-medium">
              Scroll down to see. ↓
            </a>
          </p>
        </motion.div>
      </div>
    </section>
  );
}
