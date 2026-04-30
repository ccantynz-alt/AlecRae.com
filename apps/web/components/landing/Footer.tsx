import Link from "next/link";

const links = {
  Product: [
    { label: "Features", href: "#features" },
    { label: "AI Engine", href: "#ai" },
    { label: "Pricing", href: "#pricing" },
    { label: "Security", href: "#security" },
    { label: "Changelog", href: "/changelog" },
    { label: "Status", href: "/status" },
  ],
  Resources: [
    { label: "Documentation", href: "/docs" },
    { label: "API Reference", href: "/docs" },
    { label: "Migration Guides", href: "/docs" },
  ],
  Legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
    { label: "Cookie Policy", href: "/cookies" },
    { label: "DPA", href: "/dpa" },
    { label: "SLA", href: "/sla" },
    { label: "DMCA", href: "/dmca" },
  ],
};

export function Footer(): React.ReactNode {
  return (
    <footer className="relative pt-16 pb-10 px-6">
      {/* Top gradient border */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-16">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="inline-block">
              <span className="font-[var(--font-italianno)] text-2xl text-white">
                AlecRae
              </span>
            </Link>
            <p className="text-sm text-white/35 mt-3 leading-relaxed">
              Email, Evolved.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(links).map(([category, items]) => (
            <div key={category}>
              <h4 className="text-sm font-semibold text-white mb-4">{category}</h4>
              <ul className="space-y-2.5">
                {items.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className="text-sm text-white/30 hover:text-white/70 transition-colors"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-white/[0.06] flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-white/25">
            &copy; {new Date().getFullYear()} AlecRae. All rights reserved.
          </p>
          <p className="text-xs text-white/15">
            No ads. No tracking. No data mining. Ever.
          </p>
        </div>
      </div>
    </footer>
  );
}
