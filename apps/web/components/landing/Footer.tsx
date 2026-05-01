import Link from "next/link";
import type { Route } from "next";

interface FooterLink {
  label: string;
  href: Route;
}

const r = (path: string): Route => path as Route;

const links: Record<string, FooterLink[]> = {
  Product: [
    { label: "Features", href: r("/#features") },
    { label: "AI Engine", href: r("/#ai") },
    { label: "Pricing", href: r("/#pricing") },
    { label: "Security", href: r("/#security") },
    { label: "Changelog", href: r("/changelog") },
    { label: "Status", href: r("/status") },
  ],
  Resources: [
    { label: "Documentation", href: r("/docs") },
    { label: "API Reference", href: r("/docs") },
    { label: "Migration Guides", href: r("/docs") },
  ],
  Legal: [
    { label: "Privacy Policy", href: r("/privacy") },
    { label: "Terms of Service", href: r("/terms") },
    { label: "Cookie Policy", href: r("/cookies") },
    { label: "DPA", href: r("/dpa") },
    { label: "SLA", href: r("/sla") },
    { label: "DMCA", href: r("/dmca") },
  ],
};

export function Footer() {
  return (
    <footer className="border-t border-white/5 py-16 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-16">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="text-xl font-bold tracking-tighter bg-gradient-to-r from-white to-blue-300 bg-clip-text text-transparent">
              AlecRae
            </Link>
            <p className="text-sm text-blue-100/40 mt-3 leading-relaxed">
              Email, Evolved.
              <br />
              The reinvention of email.
            </p>
          </div>
          {Object.entries(links).map(([category, items]) => (
            <div key={category}>
              <h4 className="text-sm font-semibold text-white mb-4">{category}</h4>
              <ul className="space-y-2.5">
                {items.map((item) => (
                  <li key={item.label}>
                    <Link href={item.href} className="text-sm text-blue-100/40 hover:text-white transition-colors">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-blue-100/30">
            &copy; {new Date().getFullYear()} AlecRae. All rights reserved.
          </p>
          <p className="text-xs text-blue-100/20">
            No ads. No tracking. No data mining. Ever.
          </p>
        </div>
      </div>
    </footer>
  );
}
