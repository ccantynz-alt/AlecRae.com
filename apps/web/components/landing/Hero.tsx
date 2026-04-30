"use client";

import { motion, useMotionValue, useTransform, useSpring } from "motion/react";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

const emails = [
  { id: 1, from: "Sarah Chen", avatar: "SC", subject: "Q3 Revenue Report — Final Numbers", time: "Just now", unread: true, ai: "3 action items detected", aiColor: "text-violet-300 bg-violet-500/15 border-violet-500/25", avatarBg: "bg-violet-500/20 text-violet-300" },
  { id: 2, from: "Dev Team", avatar: "DT", subject: "Deployment successful: v2.4.1 is live", time: "2m ago", unread: true, ai: "No action needed", aiColor: "text-emerald-300 bg-emerald-500/15 border-emerald-500/25", avatarBg: "bg-emerald-500/20 text-emerald-300" },
  { id: 3, from: "Alex Rivera", avatar: "AR", subject: "Re: Partnership proposal — thoughts?", time: "15m ago", unread: false, ai: "Follow-up by Friday", aiColor: "text-amber-300 bg-amber-500/15 border-amber-500/25", avatarBg: "bg-amber-500/20 text-amber-300" },
  { id: 4, from: "Newsletter", avatar: "NL", subject: "This Week in AI: GPT-5 benchmarks drop...", time: "1h ago", unread: false, ai: "3-bullet summary ready", aiColor: "text-cyan-300 bg-cyan-500/15 border-cyan-500/25", avatarBg: "bg-cyan-500/20 text-cyan-300" },
  { id: 5, from: "Jordan Lee", avatar: "JL", subject: "Meeting moved to 3pm tomorrow", time: "2h ago", unread: false, ai: "Calendar updated", aiColor: "text-blue-300 bg-blue-500/15 border-blue-500/25", avatarBg: "bg-blue-500/20 text-blue-300" },
];

function useTypewriter(text: string, speed: number = 40, startDelay: number = 0): string {
  const [displayed, setDisplayed] = useState("");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setStarted(true), startDelay);
    return () => clearTimeout(timeout);
  }, [startDelay]);

  useEffect(() => {
    if (!started) return;
    if (displayed.length >= text.length) return;
    const timeout = setTimeout(() => {
      setDisplayed(text.slice(0, displayed.length + 1));
    }, speed);
    return () => clearTimeout(timeout);
  }, [displayed, text, speed, started]);

  return displayed;
}

function LiveInbox(): React.ReactNode {
  const [visibleEmails, setVisibleEmails] = useState<number[]>([]);
  const [showAI, setShowAI] = useState<number[]>([]);

  useEffect(() => {
    emails.forEach((email, i) => {
      setTimeout(() => {
        setVisibleEmails((prev: number[]) => [...prev, email.id]);
      }, 800 + i * 600);

      setTimeout(() => {
        setShowAI((prev: number[]) => [...prev, email.id]);
      }, 1400 + i * 600);
    });
  }, []);

  return (
    <div className="relative bg-[#0c0c14]/90 backdrop-blur-2xl border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl shadow-violet-500/5">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/[0.06] bg-white/[0.02]">
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
          <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
          <div className="w-3 h-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex-1 flex items-center justify-center gap-2">
          <span className="font-[var(--font-italianno)] text-lg text-white/40 tracking-wide">AlecRae</span>
          <span className="text-[10px] text-white/20">|</span>
          <span className="text-xs text-white/30 font-medium">Inbox</span>
        </div>
        <div className="w-[52px]" />
      </div>

      <div className="divide-y divide-white/[0.04]">
        {emails.map((email) => {
          const isVisible = visibleEmails.includes(email.id);
          const hasAI = showAI.includes(email.id);

          return (
            <motion.div
              key={email.id}
              initial={{ opacity: 0, x: 30 }}
              animate={isVisible ? { opacity: 1, x: 0 } : { opacity: 0, x: 30 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className={`flex items-center gap-3.5 px-5 py-3.5 hover:bg-white/[0.03] transition-colors cursor-pointer ${email.unread ? "bg-white/[0.02]" : ""}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${email.avatarBg}`}>
                {email.avatar}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <span className={`text-sm truncate ${email.unread ? "text-white font-semibold" : "text-white/60"}`}>
                    {email.from}
                  </span>
                  <span className="text-[11px] text-white/25 flex-shrink-0">{email.time}</span>
                </div>
                <div className="text-[13px] text-white/40 truncate">{email.subject}</div>
              </div>
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={hasAI ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-medium flex-shrink-0 ${email.aiColor}`}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
                {email.ai}
              </motion.div>
            </motion.div>
          );
        })}
      </div>

      <div className="px-5 py-3 border-t border-white/[0.06] bg-white/[0.02] flex items-center justify-between">
        <span className="text-[11px] text-white/20">5 emails · 2 unread</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-violet-400/60 font-medium">AI triage active</span>
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-violet-500" />
          </span>
        </div>
      </div>
    </div>
  );
}

export function Hero(): React.ReactNode {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springX = useSpring(mouseX, { stiffness: 50, damping: 20 });
  const springY = useSpring(mouseY, { stiffness: 50, damping: 20 });

  const orbX = useTransform(springX, [0, 1], [-15, 15]);
  const orbY = useTransform(springY, [0, 1], [-15, 15]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set((e.clientX - rect.left) / rect.width);
    mouseY.set((e.clientY - rect.top) / rect.height);
  }, [mouseX, mouseY]);

  const tagline1 = useTypewriter("Your email just", 50, 300);
  const tagline2 = useTypewriter("got fun.", 60, 1200);

  return (
    <section
      className="relative min-h-screen flex items-center justify-center pt-20 pb-10 overflow-hidden"
      onMouseMove={handleMouseMove}
    >
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div
          className="absolute -top-[200px] -right-[200px] w-[600px] h-[600px] rounded-full animate-mesh-rotate"
          style={{
            background: "radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)",
            x: orbX,
            y: orbY,
          }}
        />
        <motion.div
          className="absolute -bottom-[200px] -left-[200px] w-[500px] h-[500px] rounded-full animate-mesh-rotate"
          style={{
            background: "radial-gradient(circle, rgba(6,182,212,0.12) 0%, transparent 70%)",
            animationDelay: "7s",
            x: orbX,
            y: orbY,
          }}
        />
        <motion.div
          className="absolute top-[30%] left-[40%] w-[400px] h-[400px] rounded-full animate-mesh-rotate"
          style={{
            background: "radial-gradient(circle, rgba(244,63,94,0.08) 0%, transparent 70%)",
            animationDelay: "14s",
          }}
        />

        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(139,92,246,0.06) 0%, transparent 50%)" }} />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 w-full">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-white/[0.04] border border-white/[0.08] text-sm mb-10 backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-white/50 font-medium">Beta is live</span>
              <span className="text-white/20">·</span>
              <span className="text-violet-300/70 font-medium">Join 500+ early adopters</span>
            </div>
          </motion.div>

          <motion.h1
            className="text-5xl sm:text-7xl md:text-[5.5rem] lg:text-[6.5rem] font-bold tracking-tighter leading-[0.85] mb-8"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
          >
            <span className="text-white">{tagline1}</span>
            <br />
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent animate-gradient-shift">
              {tagline2}
            </span>
            <span className="animate-typing-cursor text-violet-400 ml-1">|</span>
          </motion.h1>

          <motion.p
            className="text-lg md:text-xl text-white/40 max-w-2xl mx-auto mb-12 leading-relaxed font-light"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            AI-powered. Lightning fast. Actually enjoyable.
            <br className="hidden sm:block" />
            One app replaces your entire email stack — for{" "}
            <span className="text-white font-medium">$9/month</span>.
          </motion.p>

          <motion.div
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
          >
            <Link
              href="/register"
              className="group relative w-full sm:w-auto px-8 py-4 bg-white text-[#0a0a0f] font-semibold rounded-full hover:shadow-xl hover:shadow-violet-500/20 transition-all text-center overflow-hidden"
            >
              <span className="relative z-10">Start Free — No Card Needed</span>
              <div className="absolute inset-0 bg-gradient-to-r from-violet-200 to-cyan-200 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
            <a
              href="#features"
              className="group w-full sm:w-auto px-8 py-4 border border-white/[0.12] text-white/70 font-medium rounded-full hover:bg-white/[0.04] hover:border-white/20 hover:text-white transition-all text-center flex items-center justify-center gap-2"
            >
              See what&apos;s inside
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="group-hover:translate-y-0.5 transition-transform">
                <path d="M12 5v14M19 12l-7 7-7-7" />
              </svg>
            </a>
          </motion.div>
        </div>

        <motion.div
          className="relative max-w-4xl mx-auto"
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.8, type: "spring", stiffness: 100, damping: 20 }}
        >
          <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-violet-500/20 via-transparent to-cyan-500/20 blur-sm" />
          <div className="absolute -inset-8 bg-gradient-to-r from-violet-500/5 via-fuchsia-500/5 to-cyan-500/5 rounded-3xl blur-2xl" />
          <LiveInbox />
        </motion.div>
      </div>
    </section>
  );
}
