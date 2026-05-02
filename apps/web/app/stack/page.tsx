import type { Metadata } from "next";
import { Box, Text, Card, CardContent } from "@alecrae/ui";

export const metadata: Metadata = {
  title: "AlecRae replaces your $100+/mo email stack | alecrae.com",
  description:
    "Stop paying for Gmail Workspace + Grammarly + Dragon + Otter + Calendly + Front + Superhuman. AlecRae bundles all of it for $19/user/mo.",
};

interface StackTool {
  name: string;
  category: string;
  monthlyUsd: number;
  pricingNote?: string;
  replacedBy: string;
}

const STACK: StackTool[] = [
  {
    name: "Google Workspace Business Standard",
    category: "Email + AI",
    monthlyUsd: 12,
    pricingNote: "Per user, billed annually",
    replacedBy: "Multi-account inbox (Gmail + Outlook + IMAP under one AI brain)",
  },
  {
    name: "Gemini Advanced (Workspace add-on)",
    category: "Generative AI",
    monthlyUsd: 30,
    pricingNote: "Per user, on top of Workspace",
    replacedBy: "Local WebGPU inference at $0/token + Claude in cloud when needed",
  },
  {
    name: "Microsoft 365 Business Standard",
    category: "Email + AI",
    monthlyUsd: 12.5,
    pricingNote: "Per user, billed annually",
    replacedBy: "Same as above — Outlook unified into AlecRae's AI inbox",
  },
  {
    name: "Microsoft 365 Copilot",
    category: "Generative AI",
    monthlyUsd: 30,
    pricingNote: "Per user, on top of 365",
    replacedBy: "Voice profile + AI agent + grammar all bundled",
  },
  {
    name: "Grammarly Premium",
    category: "Writing assistance",
    monthlyUsd: 12,
    replacedBy: "Built-in grammar agent, runs on your GPU",
  },
  {
    name: "Grammarly Business",
    category: "Writing assistance (team)",
    monthlyUsd: 15,
    replacedBy: "Same — included for every seat, no add-on",
  },
  {
    name: "Dragon Professional Anywhere",
    category: "Dictation",
    monthlyUsd: 15,
    pricingNote: "$179/year per seat",
    replacedBy: "Email-aware dictation engine — multi-language, free",
  },
  {
    name: "Otter.ai Business",
    category: "Transcription",
    monthlyUsd: 30,
    pricingNote: "Per user",
    replacedBy: "Whisper-backed voice messages with auto-transcription",
  },
  {
    name: "Calendly Standard",
    category: "Scheduling",
    monthlyUsd: 10,
    pricingNote: "Per seat",
    replacedBy: "AI calendar slot suggestions inline in compose",
  },
  {
    name: "Front",
    category: "Shared inboxes",
    monthlyUsd: 19,
    pricingNote: "Starter; Growth is $49, Scale is $99",
    replacedBy: "Shared inboxes with comments + assignments built in",
  },
  {
    name: "Superhuman",
    category: "Email client",
    monthlyUsd: 30,
    pricingNote: "Personal tier",
    replacedBy: "Faster inbox, full keyboard shortcuts, and multi-account (Superhuman is Gmail-only)",
  },
  {
    name: "Hey.com",
    category: "Email client",
    monthlyUsd: 8.25,
    pricingNote: "$99/year personal",
    replacedBy: "Smart inbox + screener with AI prioritization",
  },
  {
    name: "Proton Mail Plus",
    category: "Encrypted email",
    monthlyUsd: 4,
    pricingNote: "Personal tier",
    replacedBy: "Native E2E encryption (RSA-OAEP-4096 + AES-256-GCM)",
  },
];

interface AlecRaePlan {
  name: string;
  monthlyUsd: number | string;
  description: string;
  tagline: string;
}

const PLANS: AlecRaePlan[] = [
  {
    name: "Free",
    monthlyUsd: 0,
    description: "1 account · basic AI · 30-day search",
    tagline: "More features than Gmail's free tier",
  },
  {
    name: "Personal",
    monthlyUsd: 9,
    description: "3 accounts · full AI · E2E encryption · snooze · undo send",
    tagline: "Replaces $100+/mo of consumer tools",
  },
  {
    name: "Pro",
    monthlyUsd: 19,
    description: "Unlimited accounts · priority AI · API access · analytics",
    tagline: "Replaces $200+/mo of pro tools",
  },
  {
    name: "Team",
    monthlyUsd: 12,
    description: "Per user · shared inboxes · admin console · audit logs · SSO",
    tagline: "Replaces $250+/user/mo of team tools",
  },
  {
    name: "Enterprise",
    monthlyUsd: "Custom",
    description: "On-prem option · compliance · dedicated support · Opus AI",
    tagline: "Compliance + on-prem deployment",
  },
];

function calcTotals(): {
  consumer: number;
  pro: number;
  team: number;
} {
  const find = (name: string): StackTool | undefined =>
    STACK.find((t) => t.name === name);
  const sum = (names: string[]): number =>
    names.reduce((acc, n) => acc + (find(n)?.monthlyUsd ?? 0), 0);

  const consumer = sum([
    "Google Workspace Business Standard",
    "Gemini Advanced (Workspace add-on)",
    "Grammarly Premium",
    "Dragon Professional Anywhere",
    "Calendly Standard",
    "Superhuman",
  ]);

  const pro = sum([
    "Google Workspace Business Standard",
    "Gemini Advanced (Workspace add-on)",
    "Grammarly Business",
    "Dragon Professional Anywhere",
    "Otter.ai Business",
    "Calendly Standard",
    "Superhuman",
    "Proton Mail Plus",
  ]);

  const team = sum([
    "Microsoft 365 Business Standard",
    "Microsoft 365 Copilot",
    "Grammarly Business",
    "Front",
    "Otter.ai Business",
    "Calendly Standard",
  ]);

  return { consumer, pro, team };
}

const TOTALS = calcTotals();

export default function StackPage(): React.ReactNode {
  return (
    <Box className="min-h-full bg-surface">
      <Box
        as="header"
        className="border-b border-border bg-surface/80 backdrop-blur-md sticky top-0 z-50"
      >
        <Box className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Box as="a" href="/" className="flex items-center gap-2">
            <Text variant="heading-md" className="text-brand-600 font-bold">
              AlecRae
            </Text>
          </Box>
          <Box className="flex gap-4">
            <Box as="a" href="/#pricing">
              <Text variant="body-sm" className="text-content-secondary hover:text-content">
                Pricing
              </Text>
            </Box>
            <Box as="a" href="/privacy-architecture">
              <Text variant="body-sm" className="text-content-secondary hover:text-content">
                Architecture
              </Text>
            </Box>
            <Box as="a" href="/login">
              <Text variant="body-sm" className="text-content-secondary hover:text-content">
                Sign in
              </Text>
            </Box>
          </Box>
        </Box>
      </Box>

      <Box className="max-w-5xl mx-auto px-6 py-16">
        <Box className="mb-12 text-center">
          <Text
            as="h1"
            className="text-4xl md:text-5xl font-bold tracking-tight mb-4"
          >
            One subscription. Goodbye to the stack.
          </Text>
          <Text
            variant="body-md"
            muted
            className="max-w-2xl mx-auto leading-relaxed"
          >
            Most teams pay for 6&ndash;10 separate tools to make email tolerable.
            AlecRae bundles all of them — at a fraction of the cost — into one
            client. Below is the math, fully sourced from the vendors&apos; own
            public pricing pages as of 2026.
          </Text>
        </Box>

        <Box className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          <Card className="border-status-error/20">
            <CardContent>
              <Text variant="caption" muted className="block">Consumer stack</Text>
              <Text
                as="span"
                className="text-3xl font-bold text-status-error"
              >
                ${TOTALS.consumer.toFixed(2)}
              </Text>
              <Text variant="caption" muted>
                / user / month
              </Text>
              <Text variant="caption" muted className="block mt-3">
                Workspace + Gemini + Grammarly + Dragon + Calendly + Superhuman
              </Text>
            </CardContent>
          </Card>

          <Card className="border-status-error/20">
            <CardContent>
              <Text variant="caption" muted className="block">Pro stack</Text>
              <Text
                as="span"
                className="text-3xl font-bold text-status-error"
              >
                ${TOTALS.pro.toFixed(2)}
              </Text>
              <Text variant="caption" muted>
                / user / month
              </Text>
              <Text variant="caption" muted className="block mt-3">
                Above + Otter + Proton + Grammarly Business
              </Text>
            </CardContent>
          </Card>

          <Card className="border-status-error/20">
            <CardContent>
              <Text variant="caption" muted className="block">Team stack</Text>
              <Text
                as="span"
                className="text-3xl font-bold text-status-error"
              >
                ${TOTALS.team.toFixed(2)}
              </Text>
              <Text variant="caption" muted>
                / user / month
              </Text>
              <Text variant="caption" muted className="block mt-3">
                365 + Copilot + Grammarly Business + Front + Otter + Calendly
              </Text>
            </CardContent>
          </Card>
        </Box>

        <Card className="mb-12 border-status-success/30 bg-status-success/5">
          <CardContent>
            <Box className="flex items-baseline gap-3 flex-wrap">
              <Text
                as="span"
                className="text-4xl font-bold text-status-success"
              >
                $9&ndash;$19
              </Text>
              <Text variant="body-md" muted>
                / user / month with AlecRae. All of the above. Bundled.
              </Text>
            </Box>
            <Text variant="body-sm" muted className="mt-2">
              Pro at $19 replaces ${TOTALS.pro.toFixed(2)}/user/mo — that&apos;s
              <Text
                as="span"
                className="font-semibold text-status-success ml-1"
              >
                ${(TOTALS.pro - 19).toFixed(2)}/user saved every month,
                ${((TOTALS.pro - 19) * 12).toFixed(0)}/user every year.
              </Text>{" "}
              For a 50-person team that&apos;s ${(((TOTALS.pro - 19) * 12 * 50) / 1000).toFixed(0)}K
              /year that doesn&apos;t leave your budget.
            </Text>
          </CardContent>
        </Card>

        <Box className="mb-12">
          <Text as="h2" className="text-2xl font-bold mb-4">
            What we replace
          </Text>
          <Box className="overflow-x-auto rounded-md border border-border">
            <Box as="table" className="w-full text-sm">
              <Box as="thead" className="bg-surface-secondary">
                <Box as="tr">
                  <Box
                    as="th"
                    className="text-left p-3 font-semibold border-b border-border"
                  >
                    Tool
                  </Box>
                  <Box
                    as="th"
                    className="text-left p-3 font-semibold border-b border-border"
                  >
                    Category
                  </Box>
                  <Box
                    as="th"
                    className="text-right p-3 font-semibold border-b border-border"
                  >
                    Monthly cost
                  </Box>
                  <Box
                    as="th"
                    className="text-left p-3 font-semibold border-b border-border"
                  >
                    AlecRae feature
                  </Box>
                </Box>
              </Box>
              <Box as="tbody">
                {STACK.map((tool, i) => (
                  <Box
                    as="tr"
                    key={i}
                    className={
                      i % 2 === 0
                        ? "bg-surface"
                        : "bg-surface-secondary/30"
                    }
                  >
                    <Box as="td" className="p-3 align-top font-medium">
                      {tool.name}
                      {tool.pricingNote && (
                        <Text
                          variant="caption"
                          muted
                          className="block mt-0.5"
                        >
                          {tool.pricingNote}
                        </Text>
                      )}
                    </Box>
                    <Box
                      as="td"
                      className="p-3 align-top text-content-secondary"
                    >
                      {tool.category}
                    </Box>
                    <Box
                      as="td"
                      className="p-3 align-top text-right font-medium text-status-error"
                    >
                      ${tool.monthlyUsd.toFixed(2)}
                    </Box>
                    <Box
                      as="td"
                      className="p-3 align-top text-content-secondary"
                    >
                      {tool.replacedBy}
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
        </Box>

        <Box className="mb-12">
          <Text as="h2" className="text-2xl font-bold mb-4">
            AlecRae plans
          </Text>
          <Box className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {PLANS.map((plan) => (
              <Card key={plan.name}>
                <CardContent>
                  <Text variant="caption" muted className="block uppercase tracking-wider">
                    {plan.name}
                  </Text>
                  <Box className="mt-1 flex items-baseline gap-1">
                    <Text as="span" className="text-2xl font-bold">
                      {typeof plan.monthlyUsd === "number"
                        ? `$${plan.monthlyUsd}`
                        : plan.monthlyUsd}
                    </Text>
                    {typeof plan.monthlyUsd === "number" && (
                      <Text variant="caption" muted>
                        /mo
                      </Text>
                    )}
                  </Box>
                  <Text variant="body-sm" muted className="mt-2 leading-relaxed">
                    {plan.description}
                  </Text>
                  <Text
                    variant="caption"
                    className="mt-3 block text-status-success"
                  >
                    {plan.tagline}
                  </Text>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Box>

        <Box className="mb-12 text-center">
          <Box as="a" href="/register">
            <Box
              as="span"
              className="inline-block rounded-md bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-3 transition-colors"
            >
              Start free — replace your stack
            </Box>
          </Box>
          <Text variant="caption" muted className="block mt-3">
            No credit card required. Migrate from Gmail or Outlook in 60
            seconds.
          </Text>
        </Box>

        <Text variant="caption" muted className="block text-center">
          Pricing on this page is sourced from each vendor&apos;s public pricing
          page as of May 2026 and includes only the cheapest tier needed to get
          equivalent functionality. Some teams pay more (Workspace Plus,
          Grammarly Enterprise, Front Scale). The savings get bigger.
        </Text>
      </Box>
    </Box>
  );
}
