"use client";

import { motion } from "motion/react";
import Link from "next/link";

export function CTA(): React.ReactNode {
  return (
    <section className="py-40 px-6 relative overflow-hidden">
      {/* Gradient mesh background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
        <motion.div
          className="absolute top-1/2 left-1/3 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-violet-600 rounded-full mix-blend-screen filter blur-[180px] opacity-[0.12]"
          animate={{ x: [0, 30, -20, 0], y: [0, -20, 15, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute top-1/3 right-1/4 w-[400px] h-[400px] bg-purple-600 rounded-full mix-blend-screen filter blur-[160px] opacity-[0.10]"
          animate={{ x: [0, -25, 20, 0], y: [0, 25, -10, 0] }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-1/4 left-1/2 w-[350px] h-[350px] bg-fuchsia-600 rounded-full mix-blend-screen filter blur-[150px] opacity-[0.08]"
          animate={{ x: [0, 20, -15, 0], y: [0, -15, 25, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* Floating envelope icons */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[15%] left-[10%] text-white/[0.04] animate-[orbit_25s_linear_infinite]">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" /></svg>
        </div>
        <div className="absolute top-[25%] right-[15%] text-white/[0.03] animate-[orbit_30s_linear_infinite_reverse]">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" /></svg>
        </div>
        <div className="absolute bottom-[20%] left-[20%] text-white/[0.03] animate-[orbit_35s_linear_infinite]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" /></svg>
        </div>
        <div className="absolute top-[60%] right-[8%] text-white/[0.04] animate-[orbit_28s_linear_infinite_reverse]">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" /></svg>
        </div>
        <div className="absolute bottom-[35%] right-[30%] text-white/[0.025] animate-[orbit_32s_linear_infinite]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" /></svg>
        </div>
      </div>

      {/* Orbit keyframe style */}
      <style>{`
        @keyframes orbit {
          0% { transform: translate(0, 0) rotate(0deg); }
          25% { transform: translate(15px, -20px) rotate(90deg); }
          50% { transform: translate(-10px, -35px) rotate(180deg); }
          75% { transform: translate(-20px, -10px) rotate(270deg); }
          100% { transform: translate(0, 0) rotate(360deg); }
        }
      `}</style>

      <motion.div
        className="max-w-3xl mx-auto text-center relative z-10"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ type: "spring", stiffness: 100, damping: 20 }}
      >
        <motion.h2
          className="text-4xl md:text-6xl font-bold tracking-tighter text-white mb-6"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 120, damping: 20, delay: 0.1 }}
        >
          Ready to actually{" "}
          <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
            enjoy
          </span>
          {" "}email?
        </motion.h2>

        <motion.p
          className="text-lg text-white/35 mb-12 max-w-xl mx-auto leading-relaxed"
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 120, damping: 20, delay: 0.2 }}
        >
          Join the beta. Free forever on the starter plan. No credit card. No catch.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 150, damping: 18, delay: 0.3 }}
        >
          <Link
            href="/register"
            className="group relative inline-flex items-center justify-center px-12 py-4 bg-white text-slate-950 font-semibold rounded-full text-lg transition-all duration-300 hover:bg-gradient-to-r hover:from-violet-500 hover:to-cyan-500 hover:text-white hover:shadow-[0_0_40px_rgba(139,92,246,0.3)] hover:scale-105 active:scale-[0.98]"
          >
            Get Started Free
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="ml-2 transition-transform group-hover:translate-x-1">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </motion.div>

        <motion.p
          className="text-sm text-white/20 mt-8"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.5 }}
        >
          No credit card required &middot; Cancel anytime &middot; 500+ people already switched
        </motion.p>
      </motion.div>
    </section>
  );
}
