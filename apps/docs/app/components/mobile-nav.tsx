"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { NavLink } from "./nav-link";
import { Search } from "./search";
import type { NavGroup } from "./nav-data";

interface MobileNavProps {
  readonly groups: readonly NavGroup[];
}

export function MobileNav({ groups }: MobileNavProps): React.JSX.Element {
  const [open, setOpen] = useState(false);

  const toggle = useCallback((): void => {
    setOpen((prev) => !prev);
  }, []);

  const close = useCallback((): void => {
    setOpen(false);
  }, []);

  return (
    <div className="md:hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-slate-950/80 backdrop-blur-md sticky top-0 z-30">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-bold bg-gradient-to-r from-white via-blue-200 to-cyan-300 bg-clip-text text-transparent">
            AlecRae
          </span>
          <span className="text-xs uppercase tracking-wider text-blue-200/40">Docs</span>
        </Link>
        <button
          onClick={toggle}
          className="p-2 rounded-lg text-blue-200/60 hover:bg-white/10 transition-colors"
          type="button"
          aria-label="Toggle navigation"
        >
          {open ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-20 pt-14 bg-slate-950/95 backdrop-blur-md overflow-y-auto" onClick={close} role="presentation">
          <nav className="p-6 space-y-6" onClick={(e): void => e.stopPropagation()} role="navigation">
            <div className="mb-4">
              <Search />
            </div>
            {groups.map((group) => (
              <div key={group.label}>
                <div className="text-xs font-semibold text-blue-200/40 uppercase tracking-wider mb-2 px-3">
                  {group.label}
                </div>
                <div className="space-y-0.5" onClick={close} role="list">
                  {group.items.map((item) => (
                    <div key={item.slug} role="listitem">
                      <NavLink href={`/${item.slug}`} label={item.label} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </div>
      ) : null}
    </div>
  );
}
