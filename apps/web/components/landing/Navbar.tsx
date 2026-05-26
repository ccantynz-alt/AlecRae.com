"use client";

import Link from "next/link";
import { useState } from "react";

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-white/5">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="text-2xl font-bold tracking-tighter bg-gradient-to-r from-white to-blue-300 bg-clip-text text-transparent">
          AlecRae
        </Link>

        <div className="hidden md:flex items-center gap-8 text-sm text-blue-100/70">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#ai" className="hover:text-white transition-colors">AI</a>
          <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
          <a href="#security" className="hover:text-white transition-colors">Security</a>
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link href="/login" className="text-sm text-blue-100/70 hover:text-white transition-colors px-4 py-2">
            Sign In
          </Link>
          <Link href="/register" className="text-sm font-medium bg-white text-slate-950 px-5 py-2 rounded-full hover:bg-blue-100 transition-colors">
            Get Started Free
          </Link>
        </div>

        <button
          type="button"
          className="md:hidden text-white p-2"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {mobileOpen ? (
              <path d="M18 6L6 18M6 6l12 12" />
            ) : (
              <path d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden bg-slate-950/95 backdrop-blur-xl border-b border-white/5 px-6 py-4 flex flex-col gap-4">
          <a href="#features" className="text-blue-100/70 hover:text-white" onClick={() => setMobileOpen(false)}>Features</a>
          <a href="#ai" className="text-blue-100/70 hover:text-white" onClick={() => setMobileOpen(false)}>AI</a>
          <a href="#pricing" className="text-blue-100/70 hover:text-white" onClick={() => setMobileOpen(false)}>Pricing</a>
          <a href="#security" className="text-blue-100/70 hover:text-white" onClick={() => setMobileOpen(false)}>Security</a>
          <Link href="/login" className="text-blue-100/70 hover:text-white">Sign In</Link>
          <Link href="/register" className="font-medium bg-white text-slate-950 px-5 py-2 rounded-full text-center hover:bg-blue-100">
            Get Started Free
          </Link>
        </div>
      )}
    </nav>
  );
}
