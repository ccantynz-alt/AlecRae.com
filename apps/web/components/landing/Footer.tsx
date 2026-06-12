import Link from "next/link";
import type { Route } from "next";

const links = {
  Product: [
    { label: "Features", href: "#features" },
    { label: "Intelligence", href: "#ai" },
    { label: "Pricing", href: "#pricing" },
    { label: "Privacy", href: "#security" },
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
    <footer className="border-t border-[#e3dfd3] py-16 px-6 bg-[#f5f4ef]">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-16">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="font-script text-4xl leading-none text-[#1c1a17]">
              AlecRae
            </Link>
            <p className="text-sm text-[#8a8475] mt-3 leading-relaxed">
              Email, considered.
              <br />
              The email client you&apos;d sign your name to.
            </p>
          </div>
          {Object.entries(links).map(([category, items]) => (
            <div key={category}>
              <h4 className="text-xs uppercase tracking-[0.2em] text-[#9a7b4f] mb-4">{category}</h4>
              <ul className="space-y-2.5">
                {items.map((item) => (
                  <li key={item.label}>
                    <Link href={item.href as Route} className="text-sm text-[#6b6557] hover:text-[#1c1a17] transition-colors">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="pt-8 border-t border-[#e3dfd3] flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-[#8a8475]">
            &copy; {new Date().getFullYear()} AlecRae. All rights reserved.
          </p>
          <p className="text-xs text-[#a8a294]">
            No ads. No tracking. No data mining. Ever.
          </p>
        </div>
      </div>
    </footer>
  );
}
