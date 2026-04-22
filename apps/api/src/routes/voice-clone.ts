/**
 * Voice Clone Route — S4: High-fidelity voice cloning for AI replies
 *
 * POST   /v1/voice-clone/profiles               — Create a new style profile
 * GET    /v1/voice-clone/profiles               — List user's profiles
 * GET    /v1/voice-clone/profiles/:id           — Get profile with confidence score
 * POST   /v1/voice-clone/profiles/:id/train     — Train/retrain from recent sent emails
 * DELETE /v1/voice-clone/profiles/:id           — Delete profile
 * POST   /v1/voice-clone/compose                — Compose email using a specific voice profile
 *
 * DB-backed via voice_style_profiles + voice_training_samples tables.
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  getValidatedBody,
} from "../middleware/validator.js";
import {
  getDatabase,
  emails,
  voiceStyleProfiles,
  voiceTrainingSamples,
} from "@alecrae/db";
import type { StyleFingerprintData, ExtractedFeaturesData } from "@alecrae/db";
import {
  buildStyleFingerprint,
  extractEmailFeatures,
  calculateConfidence,
  composeInVoice,
  type VoiceCloneAIClient,
} from "@alecrae/ai-engine/voice/style-cloner";

// ─── Claude client ───────────────────────────────────────────────────────────

const ANTHROPIC_API_KEY =
  process.env["ANTHROPIC_API_KEY"] ?? process.env["CLAUDE_API_KEY"];

const claudeClient: VoiceCloneAIClient = {
  async generate(prompt, options) {
    if (!ANTHROPIC_API_KEY) {
      throw new Error(
        "ANTHROPIC_API_KEY is not configured. Voice cloning requires Claude API access.",
      );
    }

    const body: Record<string, unknown> = {
      model: "claude-sonnet-4-20250514",
      max_tokens: options?.maxTokens ?? 1024,
      temperature: options?.temperature ?? 0.7,
      messages: [{ role: "user", content: prompt }],
    };
    if (options?.system) body["system"] = options.system;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Claude API error ${response.status}: ${errText}`);
    }

    const data = (await response.json()) as {
      content: { type: string; text?: string }[];
    };
    return data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
  },
};

// ─── ID generation ──────────────────────────────────────────────────────────

function generateId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${ts}${rand}`;
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const CreateProfileSchema = z.object({
  name: z.string().min(1).max(100),
  isDefault: z.boolean().optional().default(false),
});

const TrainProfileSchema = z.object({
  sampleSize: z.number().int().min(5).max(500).default(100),
});

const ComposeSchema = z.object({
  profileId: z.string().min(1).max(200),
  prompt: z.string().min(1).max(4000),
  recipient: z.string().max(200).optional(),
  threadHistory: z
    .array(
      z.object({
        from: z.string().max(200),
        body: z.string().max(8000),
      }),
    )
    .max(20)
    .optional(),
  replyTo: z
    .object({
      from: z.string().max(200),
      subject: z.string().max(500),
      body: z.string().max(8000),
    })
    .optional(),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

const voiceClone = new Hono();

// POST /v1/voice-clone/profiles — Create a new style profile
voiceClone.post(
  "/profiles",
  requireScope("voice:write"),
  validateBody(CreateProfileSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof CreateProfileSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // If setting as default, un-default all other profiles for this account
    if (input.isDefault) {
      const existing = await db
        .select({ id: voiceStyleProfiles.id })
        .from(voiceStyleProfiles)
        .where(
          and(
            eq(voiceStyleProfiles.accountId, auth.accountId),
            eq(voiceStyleProfiles.isDefault, true),
          ),
        );

      for (const row of existing) {
        await db
          .update(voiceStyleProfiles)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(eq(voiceStyleProfiles.id, row.id));
      }
    }

    const profileId = generateId("vsp");
    const now = new Date();

    await db.insert(voiceStyleProfiles).values({
      id: profileId,
      accountId: auth.accountId,
      name: input.name,
      isDefault: input.isDefault,
      sampleCount: 0,
      confidenceScore: 0,
      isTraining: false,
      createdAt: now,
      updatedAt: now,
    });

    const profile = await db
      .select()
      .from(voiceStyleProfiles)
      .where(eq(voiceStyleProfiles.id, profileId))
      .limit(1);

    return c.json({ data: profile[0] }, 201);
  },
);

// GET /v1/voice-clone/profiles — List user's profiles
voiceClone.get(
  "/profiles",
  requireScope("voice:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const profiles = await db
      .select()
      .from(voiceStyleProfiles)
      .where(eq(voiceStyleProfiles.accountId, auth.accountId))
      .orderBy(desc(voiceStyleProfiles.createdAt));

    return c.json({
      data: profiles.map((p) => ({
        id: p.id,
        name: p.name,
        sampleCount: p.sampleCount,
        confidenceScore: p.confidenceScore,
        isDefault: p.isDefault,
        isTraining: p.isTraining,
        lastTrainedAt: p.lastTrainedAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
    });
  },
);

// GET /v1/voice-clone/profiles/:id — Get profile with confidence score and fingerprint
voiceClone.get(
  "/profiles/:id",
  requireScope("voice:read"),
  async (c) => {
    const profileId = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const rows = await db
      .select()
      .from(voiceStyleProfiles)
      .where(
        and(
          eq(voiceStyleProfiles.id, profileId),
          eq(voiceStyleProfiles.accountId, auth.accountId),
        ),
      )
      .limit(1);

    const profile = rows[0];
    if (!profile) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Voice style profile not found.",
            code: "profile_not_found",
          },
        },
        404,
      );
    }

    // Count training samples
    const sampleRows = await db
      .select({ id: voiceTrainingSamples.id })
      .from(voiceTrainingSamples)
      .where(eq(voiceTrainingSamples.profileId, profileId));

    return c.json({
      data: {
        id: profile.id,
        name: profile.name,
        styleFingerprint: profile.styleFingerprint,
        sampleCount: profile.sampleCount,
        confidenceScore: profile.confidenceScore,
        isDefault: profile.isDefault,
        isTraining: profile.isTraining,
        lastTrainedAt: profile.lastTrainedAt?.toISOString() ?? null,
        trainingSampleCount: sampleRows.length,
        createdAt: profile.createdAt.toISOString(),
        updatedAt: profile.updatedAt.toISOString(),
      },
    });
  },
);

// POST /v1/voice-clone/profiles/:id/train — Train/retrain from recent sent emails
voiceClone.post(
  "/profiles/:id/train",
  requireScope("voice:write"),
  validateBody(TrainProfileSchema),
  async (c) => {
    const profileId = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof TrainProfileSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Verify profile exists and belongs to this account
    const profileRows = await db
      .select()
      .from(voiceStyleProfiles)
      .where(
        and(
          eq(voiceStyleProfiles.id, profileId),
          eq(voiceStyleProfiles.accountId, auth.accountId),
        ),
      )
      .limit(1);

    const profile = profileRows[0];
    if (!profile) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Voice style profile not found.",
            code: "profile_not_found",
          },
        },
        404,
      );
    }

    // Mark as training
    await db
      .update(voiceStyleProfiles)
      .set({ isTraining: true, updatedAt: new Date() })
      .where(eq(voiceStyleProfiles.id, profileId));

    try {
      // Fetch sent emails
      const sentEmails = await db
        .select({ id: emails.id, textBody: emails.textBody })
        .from(emails)
        .where(
          and(
            eq(emails.accountId, auth.accountId),
            eq(emails.status, "delivered"),
          ),
        )
        .orderBy(desc(emails.createdAt))
        .limit(input.sampleSize);

      const validEmails = sentEmails.filter(
        (e) => (e.textBody?.length ?? 0) > 20,
      );

      if (validEmails.length < 5) {
        await db
          .update(voiceStyleProfiles)
          .set({ isTraining: false, updatedAt: new Date() })
          .where(eq(voiceStyleProfiles.id, profileId));

        return c.json(
          {
            error: {
              type: "insufficient_data",
              message: `Need at least 5 sent emails to train a voice profile. Found ${validEmails.length}.`,
              code: "insufficient_samples",
            },
          },
          400,
        );
      }

      const texts = validEmails.map((e) => e.textBody ?? "");

      // Build the style fingerprint
      const fingerprint = await buildStyleFingerprint(auth.accountId, texts);
      const confidenceScore = calculateConfidence(fingerprint, validEmails.length);

      // Clear old training samples for this profile
      await db
        .delete(voiceTrainingSamples)
        .where(eq(voiceTrainingSamples.profileId, profileId));

      // Insert training samples with extracted features
      for (const email of validEmails) {
        const features = extractEmailFeatures(email.textBody ?? "");
        await db.insert(voiceTrainingSamples).values({
          id: generateId("vts"),
          profileId,
          emailId: email.id,
          extractedFeatures: features,
          createdAt: new Date(),
        });
      }

      // Update profile with fingerprint and confidence
      const now = new Date();
      await db
        .update(voiceStyleProfiles)
        .set({
          styleFingerprint: fingerprint,
          sampleCount: validEmails.length,
          confidenceScore,
          isTraining: false,
          lastTrainedAt: now,
          updatedAt: now,
        })
        .where(eq(voiceStyleProfiles.id, profileId));

      return c.json({
        data: {
          profileId,
          sampleCount: validEmails.length,
          confidenceScore,
          formalityLevel: fingerprint.formalityLevel,
          emojiUsage: fingerprint.emojiUsage,
          signaturePhrasesFound: fingerprint.signaturePhrases.length,
          characteristicWordsFound: fingerprint.vocabularyFingerprint.characteristicWords.length,
          trainedAt: now.toISOString(),
        },
      });
    } catch (err) {
      // Ensure isTraining is reset on failure
      await db
        .update(voiceStyleProfiles)
        .set({ isTraining: false, updatedAt: new Date() })
        .where(eq(voiceStyleProfiles.id, profileId));
      throw err;
    }
  },
);

// DELETE /v1/voice-clone/profiles/:id — Delete a profile
voiceClone.delete(
  "/profiles/:id",
  requireScope("voice:write"),
  async (c) => {
    const profileId = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    // Verify profile exists and belongs to this account
    const profileRows = await db
      .select({ id: voiceStyleProfiles.id })
      .from(voiceStyleProfiles)
      .where(
        and(
          eq(voiceStyleProfiles.id, profileId),
          eq(voiceStyleProfiles.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (profileRows.length === 0) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Voice style profile not found.",
            code: "profile_not_found",
          },
        },
        404,
      );
    }

    // Delete training samples first (cascade should handle but be explicit)
    await db
      .delete(voiceTrainingSamples)
      .where(eq(voiceTrainingSamples.profileId, profileId));

    // Delete the profile
    await db
      .delete(voiceStyleProfiles)
      .where(eq(voiceStyleProfiles.id, profileId));

    return c.json({ data: { deleted: true, id: profileId } });
  },
);

// POST /v1/voice-clone/compose — Compose email using a specific voice profile
voiceClone.post(
  "/compose",
  requireScope("voice:write"),
  validateBody(ComposeSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof ComposeSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Fetch the profile
    const profileRows = await db
      .select()
      .from(voiceStyleProfiles)
      .where(
        and(
          eq(voiceStyleProfiles.id, input.profileId),
          eq(voiceStyleProfiles.accountId, auth.accountId),
        ),
      )
      .limit(1);

    const profile = profileRows[0];
    if (!profile) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Voice style profile not found.",
            code: "profile_not_found",
          },
        },
        404,
      );
    }

    if (!profile.styleFingerprint) {
      return c.json(
        {
          error: {
            type: "not_trained",
            message: "Profile has not been trained yet. Run POST /v1/voice-clone/profiles/:id/train first.",
            code: "profile_not_trained",
          },
        },
        400,
      );
    }

    const fingerprint = profile.styleFingerprint as StyleFingerprintData;

    const result = await composeInVoice(
      auth.accountId,
      fingerprint,
      profile.sampleCount,
      input.prompt,
      {
        recipient: input.recipient,
        threadHistory: input.threadHistory,
        replyTo: input.replyTo,
      },
      claudeClient,
    );

    return c.json({
      data: {
        body: result.body,
        profileId: profile.id,
        profileName: profile.name,
        confidenceScore: result.confidenceScore,
        formalityLevel: fingerprint.formalityLevel,
        sampleCount: profile.sampleCount,
      },
    });
  },
);

export { voiceClone };
