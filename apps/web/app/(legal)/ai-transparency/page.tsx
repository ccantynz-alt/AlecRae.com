import type { Metadata } from "next";
import { Box, Text, Card, CardContent } from "@alecrae/ui";

export const metadata: Metadata = {
  title: "AI Transparency & Responsible AI | AlecRae",
  description:
    "AlecRae's responsible-AI practices, EU AI Act obligations, model inventory, human-oversight controls and user rights over automated decision-making.",
};

export default function AITransparencyPage() {
  return (
    <Box className="space-y-10">
      <Box>
        <Text as="h1" className="text-3xl font-bold text-content mb-2">
          AI Transparency &amp; Responsible AI
        </Text>
        <Text className="text-content-tertiary">
          Effective Date: April 16, 2026 &middot; Last Updated: April 16, 2026
        </Text>
      </Box>

      <Text className="text-content-secondary leading-relaxed">
        AlecRae is an AI-native product. This page describes every AI
        system we use, how we govern it, and the controls you have over
        automated decisions. It is intended to satisfy the transparency
        obligations of the EU AI Act (Regulation (EU) 2024/1689), GDPR
        Article 22, the NIST AI Risk Management Framework and the ISO/IEC
        42001 AI Management System standard.
      </Text>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          1. Our responsible-AI principles
        </Text>
        <Box className="ml-6 space-y-1 text-content-secondary">
          <Text>&bull; <strong>Human-in-the-loop by default.</strong> Irreversible or consequential actions (sending, deleting, unsubscribing, paying) always require explicit human confirmation.</Text>
          <Text>&bull; <strong>Transparency.</strong> Every AI-generated draft, summary, classification or action is labelled.</Text>
          <Text>&bull; <strong>Opt-out without degradation.</strong> Every non-essential AI feature can be disabled without losing access to core email.</Text>
          <Text>&bull; <strong>No advertising use.</strong> Your email is never used to train ad-targeting models.</Text>
          <Text>&bull; <strong>No silent training on customer content.</strong> Individual writing-style models are private to your account and are not used to train other users&apos; models.</Text>
          <Text>&bull; <strong>Right to object.</strong> Any automated decision with significant effect on you can be contested and reviewed by a human within 5 business days.</Text>
        </Box>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          2. AI systems inventory
        </Text>
        <Card className="bg-surface-subtle">
          <CardContent>
            <Box className="space-y-4 text-sm">
              <Box>
                <Text className="text-content font-semibold">Spam &amp; phishing classifier</Text>
                <Text className="text-content-secondary">Purpose: protect all users. Model: AlecRae-tuned text classifier + signals from SPF/DKIM/DMARC/ARC. Essential — cannot be disabled. EU AI Act risk tier: limited.</Text>
              </Box>
              <Box>
                <Text className="text-content font-semibold">Priority inbox / triage</Text>
                <Text className="text-content-secondary">Purpose: rank incoming email by importance. Model: Claude Haiku. Optional. Tier: limited risk.</Text>
              </Box>
              <Box>
                <Text className="text-content font-semibold">AI compose &amp; voice profile</Text>
                <Text className="text-content-secondary">Purpose: generate draft replies in the user&apos;s style. Models: Claude Haiku / Sonnet / Opus (tier-dependent) + local WebGPU inference when available. Optional. Tier: minimal risk.</Text>
              </Box>
              <Box>
                <Text className="text-content font-semibold">Grammar &amp; spell agent</Text>
                <Text className="text-content-secondary">Purpose: proofread outgoing text. Runs locally on the user device via Transformers.js / WebLLM. Tier: minimal risk.</Text>
              </Box>
              <Box>
                <Text className="text-content font-semibold">Sender trust &amp; phishing explainer</Text>
                <Text className="text-content-secondary">Purpose: explain why an email is suspicious. Model: Claude Sonnet + DNS + WHOIS signals. Tier: limited risk.</Text>
              </Box>
              <Box>
                <Text className="text-content font-semibold">Dictation &amp; transcription</Text>
                <Text className="text-content-secondary">Purpose: speech-to-text for voice composition and voice messages. Model: OpenAI Whisper. Optional. Tier: minimal risk.</Text>
              </Box>
              <Box>
                <Text className="text-content font-semibold">Inbox agent (overnight)</Text>
                <Text className="text-content-secondary">Purpose: draft replies and batch morning briefing. Outputs are proposals only and require human approval. Tier: limited risk.</Text>
              </Box>
              <Box>
                <Text className="text-content font-semibold">Semantic search</Text>
                <Text className="text-content-secondary">Purpose: natural-language email retrieval. Model: embeddings + Claude Haiku. Optional. Tier: minimal risk.</Text>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          3. Automated decision-making (GDPR Article 22)
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          Where an AlecRae system makes an automated decision that produces
          legal or similarly significant effects on you (for example,
          classifying a message as spam or blocking a sender), you have the
          right to:
        </Text>
        <Box className="ml-6 space-y-1 text-content-secondary">
          <Text>&bull; Request meaningful information about the logic of the decision.</Text>
          <Text>&bull; Express your point of view and contest the decision.</Text>
          <Text>&bull; Obtain human review within 5 business days of a written request.</Text>
        </Box>
        <Text className="text-content-secondary leading-relaxed">
          Exercise these rights by emailing dpo@alecrae.com.
        </Text>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          4. Training data and fine-tuning
        </Text>
        <Box className="ml-6 space-y-1 text-content-secondary">
          <Text>&bull; We do <strong>not</strong> use your individual email content as training data for foundation models.</Text>
          <Text>&bull; We may use aggregated, anonymised patterns (e.g., spam signatures) to improve our own classifiers. You can opt out at Settings &gt; Privacy &gt; AI training.</Text>
          <Text>&bull; Your personal voice-profile fingerprints are stored encrypted and scoped to your account.</Text>
          <Text>&bull; Our third-party model providers (Anthropic, OpenAI) are contractually barred from training their models on our production API traffic.</Text>
        </Box>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          5. EU AI Act status
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          AlecRae is a <strong>deployer and provider of limited-risk AI
          systems</strong> under the EU AI Act. We maintain:
        </Text>
        <Box className="ml-6 space-y-1 text-content-secondary">
          <Text>&bull; An internal AI System Register mapping each model to its risk tier.</Text>
          <Text>&bull; A risk-management process aligned to ISO/IEC 42001 and NIST AI RMF.</Text>
          <Text>&bull; Incident-response procedures to report serious incidents within the 15-day window under Article 62.</Text>
          <Text>&bull; Ongoing monitoring for bias, drift and performance degradation.</Text>
        </Box>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          6. Reporting an AI harm
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          If you believe an AlecRae AI system has caused you harm — for
          example, a critical email was mis-classified as spam and caused
          you loss — please email ai-ethics@alecrae.com. We will
          investigate, respond within 10 business days, and publish an
          anonymised summary in our annual Responsible AI report.
        </Text>
      </Box>
    </Box>
  );
}
