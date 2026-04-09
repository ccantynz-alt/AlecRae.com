/**
 * Voice Route — AI Writing Style Analysis & Draft Generation
 *
 * POST /v1/voice/analyze  — Trigger voice profile analysis from sent emails
 * GET  /v1/voice/profile  — Get current voice profile
 * POST /v1/voice/draft    — Generate email draft in user's voice
 * POST /v1/voice/adjust   — Adjust tone of existing text
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  getValidatedBody,
} from "../middleware/validator.js";
import { getDatabase, emails } from "@emailed/db";

// ─── Lazy import the AI compose module ───────────────────────────────────────
// The ai-engine is a separate service; we import its core classes directly.

let assistantModule: typeof import("@emailed/ai-engine/compose") | null = null;

async function getComposeModule() {
  if (!assistantModule) {
    try {
      assistantModule = await import("@emailed/ai-engine/compose") as typeof import("@emailed/ai-engine/compose");
    } catch {
      // Fallback: inline minimal implementation
      return null;
    }
  }
  return assistantModule;
}

// ─── In-memory voice profile cache (production: use DB or Redis) ─────────────

const voiceProfiles = new Map<string, unknown>();

// ─── Claude AI client adapter ────────────────────────────────────────────────

const ANTHROPIC_API_KEY = process.env["ANTHROPIC_API_KEY"] ?? process.env["CLAUDE_API_KEY"];

async function generateWithClaude(
  prompt: string,
  options?: { maxTokens?: number; temperature?: number },
): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured. Voice features require Claude API access.");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: options?.maxTokens ?? 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errText}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text?: string }>;
  };

  return data.content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const AnalyzeSchema = z.object({
  /** Number of recent sent emails to analyze (default 50, max 200) */
  sampleSize: z.number().int().min(5).max(200).default(50),
});

const DraftSchema = z.object({
  /** Brief description of what the email should say */
  instructions: z.string().min(1).max(2000),
  /** Target tone */
  tone: z
    .enum(["professional", "casual", "friendly", "formal", "urgent", "empathetic", "assertive"])
    .default("professional"),
  /** Desired length */
  length: z.enum(["brief", "moderate", "detailed"]).default("moderate"),
  /** Recipient name (for greeting) */
  recipientName: z.string().optional(),
  /** Subject line (optional — AI will suggest one if not provided) */
  subject: z.string().optional(),
  /** Original email to reply to (for context) */
  replyTo: z
    .object({
      from: z.string(),
      subject: z.string(),
      body: z.string(),
    })
    .optional(),
});

const AdjustSchema = z.object({
  body: z.string().min(1).max(10000),
  tone: z.enum([
    "professional",
    "casual",
    "friendly",
    "formal",
    "urgent",
    "empathetic",
    "assertive",
  ]),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

const voice = new Hono();

// POST /v1/voice/analyze — Build voice profile from sent emails
voice.post(
  "/analyze",
  requireScope("voice:write"),
  validateBody(AnalyzeSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof AnalyzeSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Fetch recent sent emails for voice analysis
    const sentEmails = await db
      .select({
        textBody: emails.textBody,
        subject: emails.subject,
      })
      .from(emails)
      .where(and(eq(emails.accountId, auth.accountId), eq(emails.status, "delivered")))
      .orderBy(desc(emails.createdAt))
      .limit(input.sampleSize);

    if (sentEmails.length < 5) {
      return c.json(
        {
          error: {
            type: "insufficient_data",
            message: `Need at least 5 sent emails to build a voice profile. Found ${sentEmails.length}.`,
            code: "insufficient_samples",
          },
        },
        400,
      );
    }

    // Build voice profile using text analysis
    const texts = sentEmails
      .map((e) => e.textBody ?? "")
      .filter((t) => t.length > 20);

    const allWords = texts.join(" ").toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/);
    const sentences = texts.flatMap((t) =>
      t.split(/[.!?]+/).filter((s) => s.trim().length > 0),
    );
    const avgSentenceLength =
      sentences.reduce((sum, s) => sum + s.trim().split(/\s+/).length, 0) /
      Math.max(sentences.length, 1);

    const uniqueWords = new Set(allWords);
    const typeTokenRatio = uniqueWords.size / Math.max(allWords.length, 1);
    const avgWordLength =
      allWords.reduce((sum, w) => sum + w.length, 0) / Math.max(allWords.length, 1);

    let vocabularyLevel: "simple" | "moderate" | "advanced";
    if (typeTokenRatio > 0.6 && avgWordLength > 5.5) vocabularyLevel = "advanced";
    else if (typeTokenRatio > 0.4 || avgWordLength > 4.5) vocabularyLevel = "moderate";
    else vocabularyLevel = "simple";

    const profile = {
      accountId: auth.accountId,
      averageSentenceLength: Math.round(avgSentenceLength * 10) / 10,
      vocabularyLevel,
      sampleCount: sentEmails.length,
      analyzedAt: new Date().toISOString(),
    };

    // Cache the profile
    voiceProfiles.set(auth.accountId, profile);

    return c.json({ data: profile });
  },
);

// GET /v1/voice/profile — Get current voice profile
voice.get(
  "/profile",
  requireScope("voice:read"),
  async (c) => {
    const auth = c.get("auth");

    const profile = voiceProfiles.get(auth.accountId);
    if (!profile) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "No voice profile found. Run POST /v1/voice/analyze first.",
            code: "profile_not_found",
          },
        },
        404,
      );
    }

    return c.json({ data: profile });
  },
);

// POST /v1/voice/draft — Generate email draft in user's voice
voice.post(
  "/draft",
  requireScope("voice:write"),
  validateBody(DraftSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof DraftSchema>>(c);
    const auth = c.get("auth");

    const profile = voiceProfiles.get(auth.accountId) as Record<string, unknown> | undefined;

    const parts: string[] = [
      "You are an AI email writing assistant. Write an email based on these instructions.",
      `Tone: ${input.tone}`,
      `Length: ${input.length}`,
    ];

    if (profile) {
      parts.push("");
      parts.push("Match this writing style:");
      parts.push(`- Average sentence length: ~${profile["averageSentenceLength"]} words`);
      parts.push(`- Vocabulary level: ${profile["vocabularyLevel"]}`);
    }

    if (input.recipientName) {
      parts.push(`\nRecipient name: ${input.recipientName}`);
    }

    if (input.replyTo) {
      parts.push("\n--- Original Email ---");
      parts.push(`From: ${input.replyTo.from}`);
      parts.push(`Subject: ${input.replyTo.subject}`);
      parts.push(`Body: ${input.replyTo.body.slice(0, 1500)}`);
      parts.push("--- End Original ---");
      parts.push("\nWrite a reply to the above email.");
    }

    parts.push(`\nInstructions: ${input.instructions}`);
    parts.push("\nWrite only the email body. No subject line, no headers, no preamble.");

    const maxTokens =
      input.length === "brief" ? 300 : input.length === "detailed" ? 1500 : 800;

    const body = await generateWithClaude(parts.join("\n"), { maxTokens });

    // Generate subject if not provided
    let subject = input.subject;
    if (!subject) {
      const subjectPrompt = `Based on this email body, suggest a concise subject line (max 10 words, no quotes):\n\n${body.slice(0, 500)}`;
      subject = await generateWithClaude(subjectPrompt, { maxTokens: 50 });
      subject = subject.trim().replace(/^["']|["']$/g, "");
    }

    return c.json({
      data: {
        subject,
        body: body.trim(),
        tone: input.tone,
      },
    });
  },
);

// POST /v1/voice/adjust — Adjust tone of existing text
voice.post(
  "/adjust",
  requireScope("voice:write"),
  validateBody(AdjustSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof AdjustSchema>>(c);
    const auth = c.get("auth");

    const profile = voiceProfiles.get(auth.accountId) as Record<string, unknown> | undefined;

    const parts: string[] = [
      `Rewrite the following email with a ${input.tone} tone.`,
    ];

    if (profile) {
      parts.push(`Maintain the user's writing style (avg sentence length: ~${profile["averageSentenceLength"]} words, vocabulary: ${profile["vocabularyLevel"]}).`);
    }

    parts.push("");
    parts.push("Original email:");
    parts.push(input.body);
    parts.push("");
    parts.push("Rewritten email (body only, no preamble):");

    const body = await generateWithClaude(parts.join("\n"), { maxTokens: 1500 });

    return c.json({
      data: {
        body: body.trim(),
        tone: input.tone,
      },
    });
  },
);

export { voice };
