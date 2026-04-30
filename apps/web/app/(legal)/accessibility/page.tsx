import type { Metadata } from "next";
import { Box, Text, Card, CardContent } from "@alecrae/ui";

export const metadata: Metadata = {
  title: "Accessibility Statement | AlecRae",
  description:
    "AlecRae's accessibility commitment, conformance target (WCAG 2.2 AA), supported assistive technologies, and how to report accessibility issues.",
};

export default function AccessibilityPage() {
  return (
    <Box className="space-y-10">
      <Box>
        <Text as="h1" className="text-3xl font-bold text-content mb-2">
          Accessibility Statement
        </Text>
        <Text className="text-content-tertiary">
          Effective Date: April 16, 2026 &middot; Last Updated: April 16, 2026
        </Text>
      </Box>

      <Text className="text-content-secondary leading-relaxed">
        AlecRae is committed to making email universally usable. Email is a
        human right — it cannot be locked behind a design that excludes
        anyone. This statement describes the conformance targets we have
        chosen, the standards we test against, and how we handle
        accessibility feedback.
      </Text>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          1. Conformance target
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          AlecRae targets <strong>WCAG 2.2 Level AA</strong> (with best-effort
          conformance to Level AAA where we can do so without degrading the
          experience). Our target applies to:
        </Text>
        <Box className="ml-6 space-y-1 text-content-secondary">
          <Text>&bull; The marketing site at alecrae.com.</Text>
          <Text>&bull; The AlecRae web application at mail.alecrae.com.</Text>
          <Text>&bull; The AlecRae desktop application (Electron).</Text>
          <Text>&bull; The AlecRae mobile application (iOS + Android).</Text>
          <Text>&bull; All legal and support content published under alecrae.com.</Text>
        </Box>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          2. Standards and laws
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          We aim to meet or exceed the following standards:
        </Text>
        <Box className="ml-6 space-y-1 text-content-secondary">
          <Text>&bull; Web Content Accessibility Guidelines 2.2, Level AA.</Text>
          <Text>&bull; Americans with Disabilities Act Title III effective communication standard.</Text>
          <Text>&bull; Section 508 of the U.S. Rehabilitation Act (revised).</Text>
          <Text>&bull; European Accessibility Act (EAA) effective 28 June 2025 for EU customers.</Text>
          <Text>&bull; EN 301 549 v3.2.1 (harmonised EU standard).</Text>
          <Text>&bull; UK Equality Act 2010 reasonable-adjustments obligation.</Text>
          <Text>&bull; Accessibility for Ontarians with Disabilities Act (AODA), Canada.</Text>
        </Box>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          3. What this means in practice
        </Text>
        <Box className="ml-6 space-y-1 text-content-secondary">
          <Text>&bull; Full keyboard navigation. Every action has a shortcut; nothing requires a mouse.</Text>
          <Text>&bull; Screen-reader first. Semantic HTML, real ARIA, managed focus, live regions announced.</Text>
          <Text>&bull; High-contrast, reduced-motion, and colour-blind-safe palettes.</Text>
          <Text>&bull; Adjustable font size (small, medium, large) and density (compact, comfortable, spacious).</Text>
          <Text>&bull; Minimum 44&times;44 CSS-pixel touch targets on mobile.</Text>
          <Text>&bull; Dictation and voice control as a first-class input method.</Text>
          <Text>&bull; Captions on every video; transcripts for every podcast or audio interview.</Text>
          <Text>&bull; Plain-language copy wherever feasible.</Text>
        </Box>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          4. Supported assistive technologies
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          We test on the following assistive technologies on the latest two
          stable versions of their host operating systems:
        </Text>
        <Box className="ml-6 space-y-1 text-content-secondary">
          <Text>&bull; VoiceOver (macOS, iOS, iPadOS)</Text>
          <Text>&bull; NVDA and JAWS (Windows)</Text>
          <Text>&bull; TalkBack (Android)</Text>
          <Text>&bull; Windows Narrator</Text>
          <Text>&bull; Dragon NaturallySpeaking / Voice Control</Text>
          <Text>&bull; Switch Control (iOS / macOS)</Text>
          <Text>&bull; Browser zoom up to 400% without horizontal scrolling.</Text>
        </Box>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          5. Known limitations
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          We maintain a public log of known accessibility issues. The
          following are known and being actively addressed:
        </Text>
        <Box className="ml-6 space-y-1 text-content-secondary">
          <Text>&bull; The 3D spatial inbox view is an opt-in power-user feature and is not required to use the product; an equivalent 2D list is always available.</Text>
          <Text>&bull; Some highly-interactive animations default to reduced motion when the OS-level reduced-motion preference is set.</Text>
        </Box>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          6. Feedback and escalation
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          If you experience an accessibility barrier in any AlecRae product
          or content, we want to know. Contact:
        </Text>
        <Card className="bg-surface-subtle">
          <CardContent>
            <Box className="space-y-1">
              <Text className="text-content">Email: accessibility@alecrae.com</Text>
              <Text className="text-content">Subject line: &quot;Accessibility feedback&quot;</Text>
              <Text className="text-content">
                Postal: AlecRae, Inc., Attn: Accessibility, 548 Market Street, Suite 45000, San Francisco, CA 94104
              </Text>
            </Box>
          </CardContent>
        </Card>
        <Text className="text-content-secondary leading-relaxed">
          We aim to acknowledge accessibility reports within 2 business days
          and to resolve or provide a mitigation plan within 30 days. If
          you are unsatisfied with our response you may escalate to the
          relevant national enforcement body (for example, the U.S. Access
          Board, the EU National Enforcement Body, or the UK Equality and
          Human Rights Commission).
        </Text>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          7. Assessment method
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          This statement is supported by automated testing (axe, Lighthouse,
          Pa11y) integrated into our CI pipeline, plus regular manual
          testing with assistive technologies and annual third-party audits
          by a certified accessibility auditor. The current VPAT&reg;/ACR
          can be requested from accessibility@alecrae.com.
        </Text>
      </Box>
    </Box>
  );
}
