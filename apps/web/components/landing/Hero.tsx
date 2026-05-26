"use client";

import { motion } from "motion/react";
import Link from "next/link";

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center pt-16 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-blue-500 rounded-full mix-blend-screen filter blur-[120px] opacity-20 animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-purple-500 rounded-full mix-blend-screen filter blur-[120px] opacity-15 animate-pulse" style={{ animationDelay: "1s" }} />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-cyan-500 rounded-full mix-blend-screen filter blur-[120px] opacity-10 animate-pulse" style={{ animationDelay: "2s" }} />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm text-blue-200 mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            Now in beta
          </div>
        </motion.div>

        <motion.h1
          className="text-5xl sm:text-7xl md:text-8xl font-bold tracking-tighter leading-[0.9] mb-6"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
        >
          <span className="bg-gradient-to-r from-white via-blue-100 to-cyan-200 bg-clip-text text-transparent">
            Your inbox,
          </span>
          <br />
          <span className="bg-gradient-to-r from-cyan-200 via-blue-400 to-purple-400 bg-clip-text text-transparent">
            finally intelligent.
          </span>
        </motion.h1>

        <motion.p
          className="text-lg md:text-xl text-blue-100/60 max-w-2xl mx-auto mb-10 leading-relaxed"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          AlecRae replaces your email client, grammar checker, dictation software,
          and newsletter reader. One app. One subscription. Every account. AI in every layer.
        </motion.p>

        <motion.div
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          <Link
            href="/register"
            className="w-full sm:w-auto px-8 py-3.5 bg-white text-slate-950 font-semibold rounded-full hover:bg-blue-100 transition-all hover:shadow-lg hover:shadow-blue-500/20 text-center"
          >
            Get Started Free
          </Link>
          <a
            href="#features"
            className="w-full sm:w-auto px-8 py-3.5 border border-white/20 text-white font-medium rounded-full hover:bg-white/5 transition-all text-center"
          >
            See Features
          </a>
        </motion.div>

        <motion.div
          className="relative max-w-4xl mx-auto"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.7 }}
        >
          <div className="absolute -inset-4 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-cyan-500/20 rounded-2xl blur-xl" />
          <InboxPreview />
        </motion.div>
      </div>
    </section>
  );
}

function InboxPreview() {
  const emails = [
    { from: "Sarah Chen", subject: "Q3 Revenue Report — Final Numbers", time: "10:32 AM", unread: true, ai: "Contains 3 action items" },
    { from: "Dev Team", subject: "Deployment successful: v2.4.1 is live", time: "9:15 AM", unread: true, ai: "No action needed" },
    { from: "Alex Rivera", subject: "Re: Partnership proposal — thoughts?", time: "8:48 AM", unread: false, ai: "Follow-up by Friday" },
    { from: "Newsletter", subject: "This Week in AI: Claude 4 benchmarks...", time: "7:00 AM", unread: false, ai: "3-bullet summary ready" },
    { from: "Jordan Lee", subject: "Meeting moved to 3pm tomorrow", time: "Yesterday", unread: false, ai: "Calendar updated" },
  ];

  return (
    <div className="relative bg-slate-900/90 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden shadow-2xl">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-slate-900/50">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/70" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
          <div className="w-3 h-3 rounded-full bg-green-500/70" />
        </div>
        <div className="flex-1 text-center text-xs text-blue-200/40">AlecRae — Inbox</div>
      </div>
      <div className="divide-y divide-white/5">
        {emails.map((email, i) => (
          <div key={i} className={`flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.02] transition-colors ${email.unread ? "bg-white/[0.03]" : ""}`}>
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${email.unread ? "bg-blue-400" : "bg-transparent"}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-4">
                <span className={`text-sm truncate ${email.unread ? "text-white font-semibold" : "text-blue-100/70"}`}>{email.from}</span>
                <span className="text-xs text-blue-200/30 flex-shrink-0">{email.time}</span>
              </div>
              <div className="text-sm text-blue-100/50 truncate">{email.subject}</div>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 flex-shrink-0">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-400">
                <path d="M12 2a4 4 0 0 0-4 4v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4z" />
              </svg>
              <span className="text-[11px] text-purple-300">{email.ai}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
