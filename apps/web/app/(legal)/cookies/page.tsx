import { Box, Text, Card, CardContent } from "@alecrae/ui";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cookie Policy - AlecRae",
  description:
    "AlecRae Cookie Policy explaining what cookies we use, why, and how you can control them.",
};

export default function CookiesPage() {
  return (
    <Box className="space-y-10">
      <Box>
        <Text variant="heading-lg" className="font-bold mb-2">
          Cookie Policy
        </Text>
        <Text variant="body-sm" muted>
          Effective Date: April 1, 2026 &middot; Last Updated: April 1, 2026
        </Text>
      </Box>

      <Text variant="body-md" className="text-content-secondary leading-relaxed">
        This Cookie Policy explains how AlecRae, Inc. (&quot;AlecRae,&quot;
        &quot;we,&quot; &quot;us,&quot; &quot;our&quot;) uses cookies and similar
        tracking technologies when you visit or use our platform at alecrae.dev (the
        &quot;Service&quot;). This policy should be read alongside our{" "}
        <Text as="span" className="text-brand-600 font-medium">
          Privacy Policy
        </Text>
        , which provides additional detail about how we process personal data.
      </Text>

      {/* Section 1 */}
      <Box className="space-y-4">
        <Text variant="heading-md" className="font-semibold">
          1. What Are Cookies?
        </Text>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          Cookies are small text files that are placed on your device (computer,
          tablet, or mobile) when you visit a website. They are widely used to make
          websites work more efficiently, provide a better user experience, and
          supply information to the website operators. Cookies may be &quot;session
          cookies&quot; (which expire when you close your browser) or &quot;persistent
          cookies&quot; (which remain on your device for a set period or until you
          delete them).
        </Text>
      </Box>

      {/* Section 2 */}
      <Box className="space-y-4">
        <Text variant="heading-md" className="font-semibold">
          2. Types of Cookies We Use
        </Text>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          We use the following categories of cookies on our platform:
        </Text>

        <Box className="space-y-6">
          {/* Strictly Necessary */}
          <Box className="space-y-2">
            <Text variant="body-md" className="font-semibold text-content">
              2.1 Strictly Necessary Cookies
            </Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              These cookies are essential for the operation of our platform. They
              enable core functionality such as session management, authentication,
              and security protections. Without these cookies, the Service cannot
              function properly. These cookies cannot be disabled.
            </Text>
          </Box>

          {/* Functional */}
          <Box className="space-y-2">
            <Text variant="body-md" className="font-semibold text-content">
              2.2 Functional Cookies
            </Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              These cookies enable enhanced functionality and personalization, such as
              remembering your language preference, theme selection (light/dark mode),
              inbox layout preferences, and timezone settings. They may be set by us
              or by third-party providers whose services we have added to our pages.
              If you disable these cookies, some features may not function as intended.
            </Text>
          </Box>

          {/* Analytics */}
          <Box className="space-y-2">
            <Text variant="body-md" className="font-semibold text-content">
              2.3 Analytics Cookies
            </Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              These cookies help us understand how visitors interact with our platform
              by collecting and reporting information anonymously. They allow us to
              measure and improve the performance of our Service by understanding which
              pages are most visited, how users navigate the platform, and where errors
              occur. All analytics data is aggregated and anonymized.
            </Text>
          </Box>

          {/* Performance */}
          <Box className="space-y-2">
            <Text variant="body-md" className="font-semibold text-content">
              2.4 Performance Cookies
            </Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              These cookies collect information about how you use our platform,
              including page load times, API response latency, and rendering
              performance. This data is used to monitor and optimize the
              performance of our Service. Performance data is collected in aggregate
              and does not identify individual users.
            </Text>
          </Box>
        </Box>
      </Box>

      {/* Section 3 */}
      <Box className="space-y-4">
        <Text variant="heading-md" className="font-semibold">
          3. Specific Cookies We Use
        </Text>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          The following table details the specific cookies used on our platform:
        </Text>

        <Card>
          <CardContent>
            <Box className="overflow-x-auto">
              <Box className="min-w-full">
                {/* Header */}
                <Box className="grid grid-cols-4 border-b border-border pb-3 mb-1">
                  <Text variant="body-sm" className="font-semibold text-content">
                    Cookie Name
                  </Text>
                  <Text variant="body-sm" className="font-semibold text-content">
                    Purpose
                  </Text>
                  <Text variant="body-sm" className="font-semibold text-content">
                    Duration
                  </Text>
                  <Text variant="body-sm" className="font-semibold text-content">
                    Type
                  </Text>
                </Box>

                {/* Strictly Necessary */}
                <Box className="grid grid-cols-4 py-3 border-b border-border/50">
                  <Text variant="body-sm" className="text-content-secondary font-mono">
                    __alecrae_session
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    Session management and user authentication state
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    Session
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    Strictly Necessary
                  </Text>
                </Box>
                <Box className="grid grid-cols-4 py-3 border-b border-border/50">
                  <Text variant="body-sm" className="text-content-secondary font-mono">
                    __alecrae_auth
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    Authentication token for secure login persistence
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    30 days
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    Strictly Necessary
                  </Text>
                </Box>
                <Box className="grid grid-cols-4 py-3 border-b border-border/50">
                  <Text variant="body-sm" className="text-content-secondary font-mono">
                    __alecrae_csrf
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    Cross-site request forgery protection token
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    Session
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    Strictly Necessary
                  </Text>
                </Box>
                <Box className="grid grid-cols-4 py-3 border-b border-border/50">
                  <Text variant="body-sm" className="text-content-secondary font-mono">
                    __alecrae_device
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    Device fingerprint for security and fraud detection
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    1 year
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    Strictly Necessary
                  </Text>
                </Box>

                {/* Functional */}
                <Box className="grid grid-cols-4 py-3 border-b border-border/50">
                  <Text variant="body-sm" className="text-content-secondary font-mono">
                    __alecrae_theme
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    User theme preference (light/dark/system)
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    1 year
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    Functional
                  </Text>
                </Box>
                <Box className="grid grid-cols-4 py-3 border-b border-border/50">
                  <Text variant="body-sm" className="text-content-secondary font-mono">
                    __alecrae_locale
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    Language and regional format preferences
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    1 year
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    Functional
                  </Text>
                </Box>
                <Box className="grid grid-cols-4 py-3 border-b border-border/50">
                  <Text variant="body-sm" className="text-content-secondary font-mono">
                    __alecrae_layout
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    Inbox layout and sidebar collapse state
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    1 year
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    Functional
                  </Text>
                </Box>

                {/* Analytics */}
                <Box className="grid grid-cols-4 py-3 border-b border-border/50">
                  <Text variant="body-sm" className="text-content-secondary font-mono">
                    __alecrae_analytics
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    Anonymous usage analytics identifier
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    1 year
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    Analytics
                  </Text>
                </Box>
                <Box className="grid grid-cols-4 py-3 border-b border-border/50">
                  <Text variant="body-sm" className="text-content-secondary font-mono">
                    __alecrae_ab
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    A/B testing group assignment
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    90 days
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    Analytics
                  </Text>
                </Box>

                {/* Performance */}
                <Box className="grid grid-cols-4 py-3">
                  <Text variant="body-sm" className="text-content-secondary font-mono">
                    __alecrae_perf
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    Performance monitoring and page load timing
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    Session
                  </Text>
                  <Text variant="body-sm" className="text-content-secondary">
                    Performance
                  </Text>
                </Box>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Section 4 */}
      <Box className="space-y-4">
        <Text variant="heading-md" className="font-semibold">
          4. Third-Party Cookies
        </Text>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          In addition to our own cookies, certain third-party services we use may set
          cookies on your device:
        </Text>
        <Card>
          <CardContent>
            <Box className="space-y-3">
              <Box className="grid grid-cols-3 border-b border-border pb-3 mb-1">
                <Text variant="body-sm" className="font-semibold text-content">
                  Provider
                </Text>
                <Text variant="body-sm" className="font-semibold text-content">
                  Purpose
                </Text>
                <Text variant="body-sm" className="font-semibold text-content">
                  Privacy Policy
                </Text>
              </Box>
              <Box className="grid grid-cols-3 py-2 border-b border-border/50">
                <Text variant="body-sm" className="text-content-secondary">
                  Plausible Analytics
                </Text>
                <Text variant="body-sm" className="text-content-secondary">
                  Privacy-friendly, anonymous usage analytics
                </Text>
                <Text variant="body-sm" className="text-brand-600">
                  plausible.io/privacy
                </Text>
              </Box>
              <Box className="grid grid-cols-3 py-2">
                <Text variant="body-sm" className="text-content-secondary">
                  Stripe
                </Text>
                <Text variant="body-sm" className="text-content-secondary">
                  Payment processing, fraud prevention
                </Text>
                <Text variant="body-sm" className="text-brand-600">
                  stripe.com/privacy
                </Text>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Section 5 */}
      <Box className="space-y-4">
        <Text variant="heading-md" className="font-semibold">
          5. How to Control Cookies
        </Text>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          You have several options for managing cookies:
        </Text>
        <Box className="space-y-3 pl-6">
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-brand-600 font-bold">a.</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              <Text as="span" className="font-semibold text-content">Cookie Consent Banner.</Text>{" "}
              When you first visit our platform, a cookie consent banner allows you to
              accept or reject non-essential cookies. You can change your preferences
              at any time through the &quot;Cookie Settings&quot; link in the footer of
              our website.
            </Text>
          </Box>
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-brand-600 font-bold">b.</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              <Text as="span" className="font-semibold text-content">Browser Settings.</Text>{" "}
              Most web browsers allow you to manage cookies through their settings.
              You can configure your browser to block all cookies, block third-party
              cookies only, or delete cookies when you close the browser. Consult your
              browser&apos;s help documentation for specific instructions.
            </Text>
          </Box>
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-brand-600 font-bold">c.</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              <Text as="span" className="font-semibold text-content">Platform Settings.</Text>{" "}
              Logged-in users can manage functional and analytics cookie preferences
              from the Privacy section of their Account Settings page within the
              AlecRae dashboard.
            </Text>
          </Box>
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-brand-600 font-bold">d.</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              <Text as="span" className="font-semibold text-content">Opt-Out Links.</Text>{" "}
              For third-party analytics, you can opt out directly through the
              provider&apos;s opt-out mechanism. Plausible Analytics is privacy-focused
              by design and does not use personal identifiers.
            </Text>
          </Box>
        </Box>
      </Box>

      {/* Section 6 */}
      <Box className="space-y-4">
        <Text variant="heading-md" className="font-semibold">
          6. Cookie Consent Mechanism
        </Text>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          AlecRae uses a cookie consent management platform that records your consent
          preferences. When you first visit the Service, you are presented with a
          clear choice to accept or decline non-essential cookies. Your consent
          preference is stored in a first-party cookie (__alecrae_consent) and is
          respected across all pages and subsequent visits. Strictly Necessary cookies
          do not require consent as they are essential for the Service to function.
        </Text>
      </Box>

      {/* Section 7 */}
      <Box className="space-y-4">
        <Text variant="heading-md" className="font-semibold">
          7. Impact of Disabling Cookies
        </Text>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          If you choose to disable or reject cookies, please be aware of the
          following impacts:
        </Text>
        <Box className="space-y-3 pl-6">
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-content-tertiary">(i)</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              <Text as="span" className="font-semibold text-content">Strictly Necessary:</Text>{" "}
              Disabling these cookies will prevent you from logging in and using the
              platform entirely.
            </Text>
          </Box>
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-content-tertiary">(ii)</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              <Text as="span" className="font-semibold text-content">Functional:</Text>{" "}
              Your preferences (theme, language, layout) will not be remembered between
              sessions, and you may need to reconfigure them each time you visit.
            </Text>
          </Box>
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-content-tertiary">(iii)</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              <Text as="span" className="font-semibold text-content">Analytics:</Text>{" "}
              We will be unable to understand how you use the platform, which may
              limit our ability to improve the Service.
            </Text>
          </Box>
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-content-tertiary">(iv)</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              <Text as="span" className="font-semibold text-content">Performance:</Text>{" "}
              We will be unable to monitor and optimize platform performance for
              your sessions.
            </Text>
          </Box>
        </Box>
      </Box>

      {/* Section 8 */}
      <Box className="space-y-4">
        <Text variant="heading-md" className="font-semibold">
          8. Updates to This Cookie Policy
        </Text>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          We may update this Cookie Policy from time to time to reflect changes in
          technology, legislation, or our business practices. When we make material
          changes, we will update the &quot;Last Updated&quot; date at the top of this
          page and, where required by law, provide additional notice (such as through
          our cookie consent banner or by email). We encourage you to review this
          policy periodically to stay informed about our use of cookies.
        </Text>
      </Box>

      <Box className="border-t border-border pt-6">
        <Text variant="body-sm" muted>
          Questions about our use of cookies? Contact us at privacy@alecrae.dev.
        </Text>
      </Box>
    </Box>
  );
}
