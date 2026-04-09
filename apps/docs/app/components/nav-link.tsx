"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavLinkProps {
  readonly href: string;
  readonly label: string;
}

export function NavLink({ href, label }: NavLinkProps): React.JSX.Element {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      className={`block rounded-lg px-3 py-1.5 text-sm transition-colors ${
        isActive
          ? "bg-white/10 text-white font-medium"
          : "text-blue-100/60 hover:bg-white/5 hover:text-white"
      }`}
    >
      {label}
    </Link>
  );
}
