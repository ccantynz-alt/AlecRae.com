"use client";

/**
 * AlecRae — Global legal footer.
 *
 * Renders on every public page. Links to every legal surface we publish
 * so a visitor is never more than one click from our terms, privacy
 * policy, security policy, or CPRA opt-out. Also exposes a button to
 * re-open the cookie consent preferences at any time, which is a
 * regulatory requirement under the ePrivacy Directive and CPRA.
 */

import { openConsentPreferences } from "./ConsentBanner";

const primaryLinks: readonly { href: string; label: string }[] = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/cookies", label: "Cookies" },
  { href: "/do-not-sell", label: "Do Not Sell or Share" },
  { href: "/accessibility", label: "Accessibility" },
  { href: "/security", label: "Security" },
  { href: "/dmca", label: "DMCA" },
  { href: "/acceptable-use", label: "Acceptable Use" },
  { href: "/dpa", label: "DPA" },
  { href: "/sla", label: "SLA" },
  { href: "/subprocessors", label: "Subprocessors" },
  { href: "/refund", label: "Refunds" },
  { href: "/ai-transparency", label: "AI Transparency" },
  { href: "/children", label: "Children's Privacy" },
  { href: "/california-notice", label: "California Notice" },
  { href: "/compliance", label: "Compliance" },
  { href: "/impressum", label: "Impressum" },
];

export function LegalFooter(): React.ReactElement {
  return (
    <footer
      role="contentinfo"
      className="border-t border-neutral-200 bg-[#f5f4ef] text-neutral-700"
      style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}
    >
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
            {primaryLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-neutral-600 hover:text-neutral-900 transition-colors"
              >
                {link.label}
              </a>
            ))}
            <button
              type="button"
              onClick={openConsentPreferences}
              className="text-neutral-600 hover:text-neutral-900 underline underline-offset-2 transition-colors"
            >
              Cookie preferences
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-[11px] text-neutral-500 tracking-wide">
            <div className="space-y-1">
              <p>
                &copy; 2026 AlecRae, Inc. All rights reserved.
                AlecRae&trade; is a trademark of AlecRae, Inc.
              </p>
              <p>
                548 Market Street, Suite 45000, San Francisco, CA 94104, USA &middot;
                <a className="ml-1 hover:text-neutral-900 underline underline-offset-2" href="mailto:privacy@alecrae.com">
                  privacy@alecrae.com
                </a>
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a href="/status" className="hover:text-neutral-900">System status</a>
              <a href="/changelog" className="hover:text-neutral-900">Changelog</a>
              <a href="https://docs.alecrae.com" className="hover:text-neutral-900" rel="noopener noreferrer">
                Docs
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

LegalFooter.displayName = "LegalFooter";
