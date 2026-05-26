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
