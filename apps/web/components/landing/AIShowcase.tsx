"use client";

import { motion } from "motion/react";
import { useEffect, useState, useRef } from "react";

const capabilities = [
  {
    title: "Overnight Agent",
    desc: "AI triages your inbox while you sleep. Wake up to a sorted inbox with reply drafts ready for one-tap approval.",
    gradient: "from-blue-500 to-cyan-500",
    icon: "M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646Z",
  },
  {
    title: "Voice Profile",
    desc: "AI learns your writing style — vocabulary, rhythm, formality. Every draft sounds like you, not a template.",
    gradient: "from-purple-500 to-pink-500",
    icon: "M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z",
  },
  {
    title: "Natural Language Search",
    desc: '"Find the email where someone mentioned the budget for Q3" — search by meaning, not just keywords.',
    gradient: "from-emerald-500 to-teal-500",
    icon: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z",
  },
  {
    title: "Newsletter Summaries",
    desc: "Every newsletter reduced to 3 bullets in your inbox preview. Full text on demand.",
    gradient: "from-amber-500 to-orange-500",
    icon: "M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18V7.875c0-.621.504-1.125 1.125-1.125H7.5",
  },
  {
    title: "Commitment Tracker",
    desc: 'AI catches every promise made in email. "I\'ll send that by Friday" — tracked automatically.',
    gradient: "from-red-500 to-rose-500",
    icon: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  {
    title: "Smart Unsubscribe",
    desc: "One click. AI navigates the unsubscribe page for you and confirms removal.",
    gradient: "from-indigo-500 to-violet-500",
    icon: "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636",
  },
];

const demoSteps = [
  {
    prompt: "Analyzing inbox...",
    result: "12 emails triaged, 3 need replies",
    detail: "Priority: 2 urgent, 4 important, 6 FYI",
  },
  {
    prompt: "Drafting reply to Sarah Chen...",
    result: '"Thanks Sarah — I\'ve reviewed the Q3 projections.\nThe revised timeline works. Let\'s lock in Thursday\nat 2pm to walk through the final numbers."',
    detail: "Matched your Voice Profile (professional tone)",
  },
  {
    prompt: "Summarizing newsletter...",
    result: "- Apple Vision Pro 2 ships June 10\n- Stripe raises Series D at $95B valuation\n- React 21 drops class components entirely",
    detail: "TechCrunch Daily — 2,847 words reduced to 3 bullets",
  },
  {
    prompt: "Checking grammar...",
    result: '2 suggestions applied',
    detail: '"their" changed to "there", removed double space',
  },
];

function TypingText({ text, speed = 25, onComplete }: { text: string; speed?: number; onComplete?: () => void }): React.ReactNode {
  const [displayed, setDisplayed] = useState("");
  const indexRef = useRef(0);

  useEffect(() => {
    setDisplayed("");
    indexRef.current = 0;
    const interval = setInterval(() => {
      indexRef.current += 1;
      setDisplayed(text.slice(0, indexRef.current));
      if (indexRef.current >= text.length) {
        clearInterval(interval);
        onComplete?.();
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed, onComplete]);

  return <>{displayed}</>;
}

function AnimatedTerminal(): React.ReactNode {
  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<"prompt" | "result" | "detail" | "pause">("prompt");

  useEffect(() => {
    if (phase === "pause") {
      const timeout = setTimeout(() => {
        setStepIndex((prev: number) => (prev + 1) % demoSteps.length);
        setPhase("prompt");
      }, 1800);
      return () => clearTimeout(timeout);
    }
  }, [phase]);

  const step = demoSteps[stepIndex];
  if (!step) return null;

  return (
    <div className="relative rounded-2xl border border-violet-500/20 bg-[#0c0c18] overflow-hidden">
      {/* Terminal chrome */}
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/[0.06] bg-violet-500/[0.04]">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
          <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
          <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
        </div>
        <span className="text-xs text-white/25 font-mono ml-2">alecrae-ai-engine</span>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/80 animate-pulse" />
          <span className="text-[10px] text-emerald-400/60 font-mono">LIVE</span>
        </div>
      </div>

      {/* Terminal body */}
      <div className="p-6 font-mono text-sm min-h-[220px] flex flex-col justify-start">
        {/* Prompt line */}
        <div className="flex items-start gap-2 mb-4">
          <span className="text-violet-400/80 shrink-0">{">"}</span>
          <span className="text-white/70">
            {phase === "prompt" ? (
              <TypingText
                text={step.prompt}
                speed={30}
                onComplete={() => setPhase("result")}
              />
            ) : (
              step.prompt
            )}
            {phase === "prompt" && (
              <motion.span
                animate={{ opacity: [1, 0] }}
                transition={{ duration: 0.6, repeat: Infinity, repeatType: "reverse" }}
                className="inline-block w-1.5 h-4 bg-violet-400/80 ml-0.5 align-middle"
              />
            )}
          </span>
        </div>

        {/* Result */}
        {(phase === "result" || phase === "detail" || phase === "pause") && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, type: "spring", stiffness: 300, damping: 30 }}
            className="mb-3 pl-5"
          >
            <div className="text-cyan-300/90 whitespace-pre-line">
              {phase === "result" ? (
                <TypingText
                  text={step.result}
                  speed={18}
                  onComplete={() => setPhase("detail")}
                />
              ) : (
                step.result
              )}
            </div>
          </motion.div>
        )}

        {/* Detail line */}
        {(phase === "detail" || phase === "pause") && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            onAnimationComplete={() => {
              if (phase === "detail") setPhase("pause");
            }}
            className="pl-5 text-xs text-white/25"
          >
            {step.detail}
          </motion.div>
        )}
      </div>

      {/* Step indicators */}
      <div className="flex justify-center gap-2 pb-4">
        {demoSteps.map((_, i) => (
          <div
            key={i}
            className={`h-1 rounded-full transition-all duration-500 ${
              i === stepIndex ? "w-6 bg-violet-400/80" : "w-1.5 bg-white/10"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

const tiers = [
  {
    value: "$0/token",
    label: "On-device AI",
    detail: "Runs on your GPU",
    gradient: "from-cyan-500/15 to-cyan-500/5",
    border: "border-cyan-500/15",
    textColor: "text-cyan-400",
    dotColor: "bg-cyan-400",
  },
  {
    value: "<50ms",
    label: "Edge AI",
    detail: "330+ locations",
    gradient: "from-violet-500/15 to-violet-500/5",
    border: "border-violet-500/15",
    textColor: "text-violet-400",
    dotColor: "bg-violet-400",
  },
  {
    value: "Full power",
    label: "Cloud AI",
    detail: "H100 GPUs",
    gradient: "from-fuchsia-500/15 to-fuchsia-500/5",
    border: "border-fuchsia-500/15",
    textColor: "text-fuchsia-400",
    dotColor: "bg-fuchsia-400",
  },
];

export function AIShowcase(): React.ReactNode {
  return (
    <section id="ai" className="py-32 px-6 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-violet-600 rounded-full mix-blend-screen filter blur-[250px] opacity-[0.06]" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-cyan-500 rounded-full mix-blend-screen filter blur-[200px] opacity-[0.04]" />
      </div>

      <div className="max-w-6xl mx-auto relative z-10">
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
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20">
            <svg className="w-3.5 h-3.5 text-violet-300/80" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            </svg>
            <span className="text-xs font-medium text-violet-300/80 tracking-wide">AI Engine</span>
          </div>
        </motion.div>

        {/* Headline */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-center mb-6"
        >
          <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold tracking-tighter text-white">
            AI in every layer.{" "}
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
              Not bolted on.
            </span>
          </h2>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-center text-base md:text-lg text-white/35 max-w-2xl mx-auto mb-16"
        >
          Three-tier AI architecture: free inference on your device, sub-50ms processing at the edge,
          and full cloud power when the task demands it. The platform decides. You just see speed.
        </motion.p>

        {/* Animated terminal demo */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.25, type: "spring", stiffness: 100, damping: 20 }}
          className="max-w-2xl mx-auto mb-16"
        >
          <AnimatedTerminal />
        </motion.div>

        {/* Three tier stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-16 max-w-3xl mx-auto">
          {tiers.map((tier, i) => (
            <motion.div
              key={tier.label}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 + i * 0.1, type: "spring", stiffness: 150, damping: 20 }}
              className={`group relative p-5 rounded-xl bg-gradient-to-b ${tier.gradient} border ${tier.border} hover:scale-[1.03] hover:shadow-lg transition-all duration-300 text-center`}
            >
              <div className="flex items-center justify-center gap-1.5 mb-2">
                <div className={`w-1.5 h-1.5 rounded-full ${tier.dotColor}`} />
                <span className="text-xs font-medium text-white/40 uppercase tracking-wider">{tier.label}</span>
              </div>
              <div className={`text-2xl font-bold ${tier.textColor} mb-1`}>{tier.value}</div>
              <div className="text-xs text-white/30">{tier.detail}</div>
            </motion.div>
          ))}
        </div>

        {/* Capability cards 3x2 grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {capabilities.map((c, i) => (
            <motion.div
              key={c.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: i * 0.08, type: "spring", stiffness: 150, damping: 20 }}
              className="group relative p-6 rounded-2xl bg-gradient-to-b from-white/[0.04] to-white/[0.01] border border-white/[0.08] hover:border-white/[0.16] hover:scale-[1.02] hover:shadow-xl hover:shadow-violet-500/[0.03] transition-all duration-300 overflow-hidden"
            >
              {/* Colored top border gradient */}
              <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r ${c.gradient} opacity-40 group-hover:opacity-100 transition-opacity duration-300`} />

              <div className="flex items-center gap-3 mb-3">
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${c.gradient} flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity`}>
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d={c.icon} />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-white tracking-tight">{c.title}</h3>
              </div>
              <p className="text-sm text-white/35 leading-relaxed">{c.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
