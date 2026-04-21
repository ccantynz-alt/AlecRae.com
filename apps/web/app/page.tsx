import { Box, Text, Button, Card, CardContent } from "@emailed/ui";

const features = [
  {
    title: "AI-Powered Inbox",
    description:
      "Smart prioritization learns what matters to you. Conversations are threaded intelligently and surfaced when you need them.",
  },
  {
    title: "Intelligent Composition",
    description:
      "Write better emails faster with AI-assisted drafting, tone adjustment, and contextual suggestions in real time.",
  },
  {
    title: "Enterprise Deliverability",
    description:
      "Automated SPF, DKIM, and DMARC configuration. Real-time reputation monitoring and deliverability analytics.",
  },
  {
    title: "Domain Management",
    description:
      "Add and verify custom domains in minutes. DNS configuration guides and automated verification checks.",
  },
  {
    title: "Advanced Analytics",
    description:
      "Track open rates, engagement metrics, bounce rates, and sender reputation across all your domains.",
  },
  {
    title: "Privacy First",
    description:
      "End-to-end encryption, passkey authentication, and zero-knowledge architecture. Your emails remain yours.",
  },
] as const;

const pricingTiers = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Perfect for getting started and personal projects.",
    features: [
      "1,000 emails per month",
      "1 verified domain",
      "2 webhooks",
      "Basic analytics",
      "Community support",
    ],
    cta: "Get Started",
    href: "/register",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$29",
    period: "/mo",
    description: "For growing teams that need more power and insights.",
    features: [
      "10,000 emails per month",
      "5 verified domains",
      "10 webhooks",
      "Full analytics & deliverability insights",
      "Template system",
      "Email support",
    ],
    cta: "Start Pro Trial",
    href: "/register?plan=pro",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "$99",
    period: "/mo",
    description: "For businesses that demand the best deliverability and support.",
    features: [
      "100,000 emails per month",
      "25 verified domains",
      "50 webhooks",
      "Advanced analytics & AI insights",
      "IP warm-up orchestrator",
      "Custom DKIM key rotation",
      "Priority support",
    ],
    cta: "Start Enterprise Trial",
    href: "/register?plan=enterprise",
    highlighted: false,
  },
] as const;

export default function LandingPage() {
  return (
    <Box className="min-h-full">
      <LandingNav />
      <HeroSection />
      <FeaturesSection />
      <PricingSection />
      <CTASection />
      <LandingFooter />
    </Box>
  );
}

function LandingNav() {
  return (
    <Box as="header" className="fixed top-0 inset-x-0 z-50 bg-surface/80 backdrop-blur-md border-b border-border">
      <Box className="max-w-7xl mx-auto flex items-center justify-between px-6 h-16">
        <Box as="a" href="/" className="flex items-center gap-2">
          <Text variant="heading-md" className="text-brand-600 font-bold">
            Emailed
          </Text>
        </Box>
        <Box as="nav" className="hidden md:flex items-center gap-8">
          <Box as="a" href="#features" className="text-body-sm text-content-secondary hover:text-content transition-colors">
            <Text as="span" variant="body-sm">Features</Text>
          </Box>
          <Box as="a" href="#pricing" className="text-body-sm text-content-secondary hover:text-content transition-colors">
            <Text as="span" variant="body-sm">Pricing</Text>
          </Box>
          <Box as="a" href="/login" className="text-body-sm text-content-secondary hover:text-content transition-colors">
            <Text as="span" variant="body-sm">Sign In</Text>
          </Box>
          <Button variant="primary" size="sm" {...{ as: "a", href: "/register" } as any}>
            Get Started
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

LandingNav.displayName = "LandingNav";

function HeroSection() {
  return (
    <Box as="section" className="pt-32 pb-20 px-6">
      <Box className="max-w-4xl mx-auto text-center">
        <Text variant="display-lg" className="mb-6">
          Email, reimagined with AI
        </Text>
        <Text variant="body-lg" muted className="max-w-2xl mx-auto mb-10">
          Emailed is the AI-native email platform that understands your communication. Smart
          prioritization, intelligent composition, and enterprise-grade infrastructure -- all in one
          place.
        </Text>
        <Box className="flex items-center justify-center gap-4">
          <Button variant="primary" size="lg" {...{ as: "a", href: "/register" } as any}>
            Start for Free
          </Button>
          <Button variant="secondary" size="lg" {...{ as: "a", href: "#pricing" } as any}>
            See How It Works
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

HeroSection.displayName = "HeroSection";

function FeaturesSection() {
  return (
    <Box as="section" id="features" className="py-20 px-6 bg-surface-secondary">
      <Box className="max-w-6xl mx-auto">
        <Box className="text-center mb-16">
          <Text variant="display-sm" className="mb-4">
            Everything you need in an email platform
          </Text>
          <Text variant="body-lg" muted className="max-w-2xl mx-auto">
            Built from the ground up with AI at its core, not bolted on as an afterthought.
          </Text>
        </Box>
        <Box className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => (
            <Card key={feature.title} hoverable>
              <CardContent>
                <Text variant="heading-sm" className="mb-2">
                  {feature.title}
                </Text>
                <Text variant="body-sm" muted>
                  {feature.description}
                </Text>
              </CardContent>
            </Card>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

FeaturesSection.displayName = "FeaturesSection";

function PricingSection() {
  return (
    <Box as="section" id="pricing" className="py-20 px-6">
      <Box className="max-w-6xl mx-auto">
        <Box className="text-center mb-16">
          <Text variant="display-sm" className="mb-4">
            Simple, transparent pricing
          </Text>
          <Text variant="body-lg" muted className="max-w-2xl mx-auto">
            Start free and scale as you grow. No hidden fees, no surprises.
          </Text>
        </Box>
        <Box className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
          {pricingTiers.map((tier) => (
            <Card
              key={tier.name}
              className={`relative flex flex-col ${
                tier.highlighted
                  ? "border-brand-500 ring-2 ring-brand-500/20 scale-[1.02]"
                  : ""
              }`}
            >
              {tier.highlighted && (
                <Box className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-brand-500 text-white">
                  <Text variant="caption" className="font-semibold text-white">
                    Most Popular
                  </Text>
                </Box>
              )}
              <CardContent className="flex flex-col flex-1 pt-8 pb-8">
                <Box className="mb-6">
                  <Text variant="heading-sm" className="mb-2">
                    {tier.name}
                  </Text>
                  <Box className="flex items-baseline gap-1">
                    <Text variant="display-sm">{tier.price}</Text>
                    <Text variant="body-sm" muted>
                      {tier.period}
                    </Text>
                  </Box>
                  <Text variant="body-sm" muted className="mt-2">
                    {tier.description}
                  </Text>
                </Box>
                <Box className="space-y-3 flex-1 mb-8">
                  {tier.features.map((feature) => (
                    <Box key={feature} className="flex items-start gap-2">
                      <Text
                        variant="body-sm"
                        className="text-status-success flex-shrink-0 mt-0.5"
                      >
                        &#10003;
                      </Text>
                      <Text variant="body-sm">{feature}</Text>
                    </Box>
                  ))}
                </Box>
                <Button
                  variant={tier.highlighted ? "primary" : "secondary"}
                  size="lg"
                  className="w-full"
                  {...{ as: "a", href: tier.href } as any}
                >
                  {tier.cta}
                </Button>
              </CardContent>
            </Card>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

PricingSection.displayName = "PricingSection";

function CTASection() {
  return (
    <Box as="section" className="py-20 px-6">
      <Box className="max-w-3xl mx-auto text-center">
        <Text variant="display-sm" className="mb-4">
          Ready to transform your email?
        </Text>
        <Text variant="body-lg" muted className="mb-8">
          Join thousands of professionals who have already made the switch to intelligent email.
        </Text>
        <Button variant="primary" size="lg" {...{ as: "a", href: "/register" } as any}>
          Get Started Free
        </Button>
      </Box>
    </Box>
  );
}

CTASection.displayName = "CTASection";

function LandingFooter() {
  return (
    <Box as="footer" className="border-t border-border py-12 px-6">
      <Box className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <Box className="flex flex-col items-center md:items-start gap-1">
          <Text variant="heading-sm" className="text-brand-600 font-bold">
            Emailed
          </Text>
          <Text variant="caption" muted>
            &copy; 2026 Emailed. All rights reserved.
          </Text>
        </Box>
        <Box className="flex items-center gap-6">
          <Box as="a" href="/privacy" className="hover:text-content transition-colors">
            <Text variant="body-sm" muted>Privacy</Text>
          </Box>
          <Box as="a" href="/terms" className="hover:text-content transition-colors">
            <Text variant="body-sm" muted>Terms</Text>
          </Box>
          <Box as="a" href="/docs" className="hover:text-content transition-colors">
            <Text variant="body-sm" muted>Docs</Text>
          </Box>
          <Box as="a" href="/login" className="hover:text-content transition-colors">
            <Text variant="body-sm" muted>Sign In</Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

LandingFooter.displayName = "LandingFooter";
