"use client";

import Link from "next/link";
import { useState } from "react";

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#f5f4ef]/90 backdrop-blur-xl border-b border-[#e3dfd3]">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="font-script text-4xl leading-none text-[#1c1a17]">
          AlecRae
        </Link>

        <div className="hidden md:flex items-center gap-10 text-sm text-[#6b6557]">
          <a href="#features" className="hover:text-[#1c1a17] transition-colors">Features</a>
          <a href="#ai" className="hover:text-[#1c1a17] transition-colors">Intelligence</a>
          <a href="#pricing" className="hover:text-[#1c1a17] transition-colors">Pricing</a>
          <a href="#security" className="hover:text-[#1c1a17] transition-colors">Privacy</a>
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link href="/login" className="text-sm text-[#6b6557] hover:text-[#1c1a17] transition-colors px-4 py-2">
            Sign in
          </Link>
          <Link href="/register" className="text-sm font-medium bg-[#1c1a17] text-[#f5f4ef] px-6 py-2.5 rounded-full hover:bg-[#1f3d2e] transition-colors">
            Get started
          </Link>
        </div>

        <button
          type="button"
          className="md:hidden text-[#1c1a17] p-2"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            {mobileOpen ? (
              <path d="M18 6L6 18M6 6l12 12" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" />
            )}
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden bg-[#f5f4ef]/95 backdrop-blur-xl border-b border-[#e3dfd3] px-6 py-5 flex flex-col gap-4">
          <a href="#features" className="text-[#6b6557] hover:text-[#1c1a17]" onClick={() => setMobileOpen(false)}>Features</a>
          <a href="#ai" className="text-[#6b6557] hover:text-[#1c1a17]" onClick={() => setMobileOpen(false)}>Intelligence</a>
          <a href="#pricing" className="text-[#6b6557] hover:text-[#1c1a17]" onClick={() => setMobileOpen(false)}>Pricing</a>
          <a href="#security" className="text-[#6b6557] hover:text-[#1c1a17]" onClick={() => setMobileOpen(false)}>Privacy</a>
          <Link href="/login" className="text-[#6b6557] hover:text-[#1c1a17]">Sign in</Link>
          <Link href="/register" className="font-medium bg-[#1c1a17] text-[#f5f4ef] px-6 py-2.5 rounded-full text-center hover:bg-[#1f3d2e]">
            Get started
          </Link>
        </div>
      )}
    </nav>
  );
}
