"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";

export function Navbar(): React.ReactNode {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = (): void => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <motion.nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-[#0a0a0f]/80 backdrop-blur-2xl border-b border-white/[0.06] shadow-lg shadow-black/20"
          : "bg-transparent"
      }`}
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-1.5 group">
          <span className="font-[var(--font-italianno)] text-3xl text-white group-hover:text-violet-300 transition-colors">
            AlecRae
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {[
            { label: "Features", href: "#features" },
            { label: "AI", href: "#ai" },
            { label: "Pricing", href: "#pricing" },
            { label: "Security", href: "#security" },
          ].map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="px-4 py-2 text-sm text-white/50 hover:text-white rounded-lg hover:bg-white/[0.04] transition-all font-medium"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm text-white/50 hover:text-white transition-colors px-4 py-2 font-medium"
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className="text-sm font-semibold bg-white text-[#0a0a0f] px-5 py-2.5 rounded-full hover:bg-violet-100 transition-all hover:shadow-lg hover:shadow-violet-500/10"
          >
            Get Started Free
          </Link>
        </div>

        <button
          type="button"
          className="md:hidden text-white/60 hover:text-white p-2 transition-colors"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {mobileOpen ? (
              <path d="M18 6L6 18M6 6l12 12" />
            ) : (
              <path d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden overflow-hidden bg-[#0a0a0f]/95 backdrop-blur-2xl border-b border-white/[0.06]"
          >
            <div className="px-6 py-6 flex flex-col gap-1">
              {[
                { label: "Features", href: "#features" },
                { label: "AI", href: "#ai" },
                { label: "Pricing", href: "#pricing" },
                { label: "Security", href: "#security" },
              ].map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="text-white/60 hover:text-white py-3 px-3 rounded-lg hover:bg-white/[0.04] transition-all font-medium"
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </a>
              ))}
              <div className="h-px bg-white/[0.06] my-3" />
              <Link href="/login" className="text-white/60 hover:text-white py-3 px-3 font-medium" onClick={() => setMobileOpen(false)}>
                Sign In
              </Link>
              <Link
                href="/register"
                className="font-semibold bg-white text-[#0a0a0f] px-5 py-3 rounded-full text-center hover:bg-violet-100 mt-2"
                onClick={() => setMobileOpen(false)}
              >
                Get Started Free
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
