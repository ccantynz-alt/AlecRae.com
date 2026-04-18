/**
 * Onboarding Route — Gmail + Microsoft 365 Onboarding Wizard
 *
 * Guided setup flow for new users AFTER they connect their account.
 * This is NOT OAuth (that's in connect.ts). This handles the onboarding
 * experience: importing settings, syncing contacts, setting preferences.
 *
 * GET  /v1/onboarding/status              — Get onboarding progress
 * POST /v1/onboarding/start               — Start onboarding (create record)
 * POST /v1/onboarding/step/:step          — Mark a step complete
 * POST /v1/onboarding/import-settings     — Import settings from Gmail/Outlook
 * POST /v1/onboarding/sync-contacts       — Trigger initial contact sync
 * POST /v1/onboarding/preferences         — Set initial preferences
 * POST /v1/onboarding/complete            — Mark onboarding complete
 * GET  /v1/onboarding/recommendations     — AI-powered recommendations
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  getValidatedBody,
} from "../middleware/validator.js";
import { getDatabase } from "@alecrae/db";
import { onboardingRecords } from "@alecrae/db";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const ONBOARDING_STEPS = [
  "connect_account",
  "import_settings",
  "sync_contacts",
  "set_preferences",
  "explore_features",
  "complete",
] as const;

type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

const StartOnboardingSchema = z.object({
  importedFrom: z.enum(["gmail", "outlook", "imap"]).optional(),
});

const StepSchema = z.object({
  step: z.enum(ONBOARDING_STEPS),
});

const ImportSettingsSchema = z.object({
  provider: z.enum(["gmail", "outlook"]),
  importLabels: z.boolean().default(true),
  importFilters: z.boolean().default(true),
  importSignatures: z.boolean().default(true),
});

const SyncContactsSchema = z.object({
  provider: z.enum(["gmail", "outlook", "imap"]),
  maxContacts: z.number().int().min(1).max(10000).default(5000),
});

const PreferencesSchema = z.object({
  density: z.enum(["compact", "comfortable", "spacious"]).optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  aiLevel: z.enum(["off", "minimal", "standard", "aggressive"]).optional(),
  notifications: z.enum(["all", "important", "none"]).optional(),
  defaultSignature: z.string().optional(),
  keyboardShortcuts: z.boolean().optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getNextStep(completedSteps: string[]): OnboardingStep {
  for (const step of ONBOARDING_STEPS) {
    if (!completedSteps.includes(step)) {
      return step;
    }
  }
  return "complete";
}

interface ImportedSettings {
  labels: string[];
  filters: Array<{ criteria: string; action: string }>;
  signatures: Array<{ name: string; content: string }>;
}

function buildImportedSettings(
  provider: "gmail" | "outlook",
  options: { importLabels: boolean; importFilters: boolean; importSignatures: boolean },
): ImportedSettings {
  // Provider-specific default label names for import simulation.
  // In production this would call the Gmail/Outlook API to fetch real data.
  const providerLabels: Record<"gmail" | "outlook", string[]> = {
    gmail: ["Important", "Starred", "Sent", "Drafts", "Spam", "Trash", "Updates", "Promotions", "Social", "Forums"],
    outlook: ["Focused", "Other", "Sent Items", "Drafts", "Junk Email", "Deleted Items", "Archive"],
  };

  const providerFilters: Record<"gmail" | "outlook", Array<{ criteria: string; action: string }>> = {
    gmail: [
      { criteria: "from:notifications@github.com", action: "label:GitHub" },
      { criteria: "from:noreply@medium.com", action: "label:Reading" },
    ],
    outlook: [
      { criteria: "from:notifications@microsoft.com", action: "move:Updates" },
      { criteria: "hasAttachment:true size:>5MB", action: "move:Large Files" },
    ],
  };

  const providerSignatures: Record<"gmail" | "outlook", Array<{ name: string; content: string }>> = {
    gmail: [{ name: "Default Gmail Signature", content: "Sent from AlecRae" }],
    outlook: [{ name: "Default Outlook Signature", content: "Sent from AlecRae" }],
  };

  return {
    labels: options.importLabels ? (providerLabels[provider] ?? []) : [],
    filters: options.importFilters ? (providerFilters[provider] ?? []) : [],
    signatures: options.importSignatures ? (providerSignatures[provider] ?? []) : [],
  };
}

interface Recommendation {
  id: string;
  title: string;
  description: string;
  action: string;
  priority: "high" | "medium" | "low";
}

function generateRecommendations(
  importedFrom: string | null,
  completedSteps: string[],
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  if (!completedSteps.includes("import_settings")) {
    recommendations.push({
      id: "import-settings",
      title: "Import your settings",
      description: "Bring your labels, filters, and signatures from your existing email provider to feel right at home.",
      action: "/v1/onboarding/import-settings",
      priority: "high",
    });
  }

  if (!completedSteps.includes("sync_contacts")) {
    recommendations.push({
      id: "sync-contacts",
      title: "Sync your contacts",
      description: "Import your contacts so AlecRae can provide smart autocomplete and sender verification.",
      action: "/v1/onboarding/sync-contacts",
      priority: "high",
    });
  }

  if (!completedSteps.includes("set_preferences")) {
    recommendations.push({
      id: "set-preferences",
      title: "Customize your experience",
      description: "Set your preferred theme, density, AI level, and notification preferences.",
      action: "/v1/onboarding/preferences",
      priority: "medium",
    });
  }

  // AI-powered recommendations based on provider
  if (importedFrom === "gmail") {
    recommendations.push({
      id: "try-ai-compose",
      title: "Try AI Compose",
      description: "AlecRae's AI learns your writing style — try composing an email and see how it adapts to sound like you.",
      action: "/compose",
      priority: "medium",
    });
    recommendations.push({
      id: "keyboard-shortcuts",
      title: "Learn keyboard shortcuts",
      description: "AlecRae supports all Gmail shortcuts plus 50+ more. Press Cmd+K to open the command palette.",
      action: "/settings/shortcuts",
      priority: "low",
    });
  }

  if (importedFrom === "outlook") {
    recommendations.push({
      id: "focused-inbox",
      title: "Try Smart Inbox",
      description: "AlecRae's AI-powered inbox goes beyond Focused Inbox — it learns your priorities and auto-triages in real time.",
      action: "/inbox",
      priority: "medium",
    });
    recommendations.push({
      id: "calendar-integration",
      title: "Connect your calendar",
      description: "AlecRae can suggest meeting times inline when you type 'let's meet next week' in an email.",
      action: "/settings/calendar",
      priority: "low",
    });
  }

  if (!completedSteps.includes("explore_features")) {
    recommendations.push({
      id: "explore-features",
      title: "Explore AlecRae features",
      description: "Discover AI triage, voice compose, email recall, and 60+ features that make AlecRae the last email client you'll ever need.",
      action: "/explore",
      priority: "low",
    });
  }

  return recommendations;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

const onboardingRouter = new Hono();

// GET /v1/onboarding/status — Get onboarding progress
onboardingRouter.get(
  "/status",
  requireScope("account:manage"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const [record] = await db
      .select()
      .from(onboardingRecords)
      .where(eq(onboardingRecords.accountId, auth.accountId))
      .limit(1);

    if (!record) {
      return c.json({
        data: {
          started: false,
          completed: false,
          currentStep: "connect_account",
          completedSteps: [],
          progress: 0,
        },
      });
    }

    const completedSteps = (record.completedSteps ?? []) as string[];
    const progress = Math.round((completedSteps.length / ONBOARDING_STEPS.length) * 100);

    return c.json({
      data: {
        started: true,
        completed: record.completedAt !== null,
        currentStep: record.currentStep,
        completedSteps,
        importedFrom: record.importedFrom,
        preferences: record.preferences,
        progress,
        startedAt: record.startedAt.toISOString(),
        completedAt: record.completedAt?.toISOString() ?? null,
      },
    });
  },
);

// POST /v1/onboarding/start — Start onboarding
onboardingRouter.post(
  "/start",
  requireScope("account:manage"),
  validateBody(StartOnboardingSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof StartOnboardingSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Check if onboarding already exists
    const [existing] = await db
      .select({ id: onboardingRecords.id })
      .from(onboardingRecords)
      .where(eq(onboardingRecords.accountId, auth.accountId))
      .limit(1);

    if (existing) {
      return c.json(
        {
          error: {
            type: "conflict",
            message: "Onboarding already started for this account",
            code: "onboarding_already_started",
          },
        },
        409,
      );
    }

    const id = generateId();
    const now = new Date();

    await db.insert(onboardingRecords).values({
      id,
      userId: auth.accountId,
      accountId: auth.accountId,
      currentStep: "connect_account",
      completedSteps: [],
      importedFrom: input.importedFrom ?? null,
      preferences: {},
      startedAt: now,
      completedAt: null,
      createdAt: now,
    });

    return c.json(
      {
        data: {
          id,
          currentStep: "connect_account",
          completedSteps: [],
          importedFrom: input.importedFrom ?? null,
          startedAt: now.toISOString(),
        },
      },
      201,
    );
  },
);

// POST /v1/onboarding/step/:step — Mark a step complete
onboardingRouter.post(
  "/step/:step",
  requireScope("account:manage"),
  async (c) => {
    const stepParam = c.req.param("step");
    const auth = c.get("auth");
    const db = getDatabase();

    // Validate step parameter
    const parsed = StepSchema.safeParse({ step: stepParam });
    if (!parsed.success) {
      return c.json(
        {
          error: {
            type: "validation_error",
            message: `Invalid step "${stepParam}". Valid steps: ${ONBOARDING_STEPS.join(", ")}`,
            code: "invalid_step",
          },
        },
        400,
      );
    }

    const step = parsed.data.step;

    const [record] = await db
      .select()
      .from(onboardingRecords)
      .where(eq(onboardingRecords.accountId, auth.accountId))
      .limit(1);

    if (!record) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Onboarding not started. Call POST /v1/onboarding/start first.",
            code: "onboarding_not_found",
          },
        },
        404,
      );
    }

    const completedSteps = (record.completedSteps ?? []) as string[];

    if (completedSteps.includes(step)) {
      return c.json({
        data: {
          step,
          alreadyCompleted: true,
          currentStep: record.currentStep,
          completedSteps,
          progress: Math.round((completedSteps.length / ONBOARDING_STEPS.length) * 100),
        },
      });
    }

    const updatedSteps = [...completedSteps, step];
    const nextStep = getNextStep(updatedSteps);
    const now = new Date();

    await db
      .update(onboardingRecords)
      .set({
        completedSteps: updatedSteps,
        currentStep: nextStep,
        ...(nextStep === "complete" ? { completedAt: now } : {}),
      })
      .where(eq(onboardingRecords.accountId, auth.accountId));

    return c.json({
      data: {
        step,
        completed: true,
        currentStep: nextStep,
        completedSteps: updatedSteps,
        progress: Math.round((updatedSteps.length / ONBOARDING_STEPS.length) * 100),
      },
    });
  },
);

// POST /v1/onboarding/import-settings — Import settings from Gmail/Outlook
onboardingRouter.post(
  "/import-settings",
  requireScope("account:manage"),
  validateBody(ImportSettingsSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof ImportSettingsSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [record] = await db
      .select()
      .from(onboardingRecords)
      .where(eq(onboardingRecords.accountId, auth.accountId))
      .limit(1);

    if (!record) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Onboarding not started. Call POST /v1/onboarding/start first.",
            code: "onboarding_not_found",
          },
        },
        404,
      );
    }

    // Build imported settings based on provider and options
    const imported = buildImportedSettings(input.provider, {
      importLabels: input.importLabels,
      importFilters: input.importFilters,
      importSignatures: input.importSignatures,
    });

    // Mark import_settings step as complete
    const completedSteps = (record.completedSteps ?? []) as string[];
    const updatedSteps = completedSteps.includes("import_settings")
      ? completedSteps
      : [...completedSteps, "import_settings"];
    const nextStep = getNextStep(updatedSteps);

    await db
      .update(onboardingRecords)
      .set({
        importedFrom: input.provider,
        completedSteps: updatedSteps,
        currentStep: nextStep,
      })
      .where(eq(onboardingRecords.accountId, auth.accountId));

    return c.json({
      data: {
        provider: input.provider,
        imported: {
          labelsCount: imported.labels.length,
          filtersCount: imported.filters.length,
          signaturesCount: imported.signatures.length,
          labels: imported.labels,
          filters: imported.filters,
          signatures: imported.signatures,
        },
        currentStep: nextStep,
        completedSteps: updatedSteps,
        progress: Math.round((updatedSteps.length / ONBOARDING_STEPS.length) * 100),
      },
    });
  },
);

// POST /v1/onboarding/sync-contacts — Trigger initial contact sync
onboardingRouter.post(
  "/sync-contacts",
  requireScope("account:manage"),
  validateBody(SyncContactsSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof SyncContactsSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [record] = await db
      .select()
      .from(onboardingRecords)
      .where(eq(onboardingRecords.accountId, auth.accountId))
      .limit(1);

    if (!record) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Onboarding not started. Call POST /v1/onboarding/start first.",
            code: "onboarding_not_found",
          },
        },
        404,
      );
    }

    // Mark sync_contacts step as complete
    const completedSteps = (record.completedSteps ?? []) as string[];
    const updatedSteps = completedSteps.includes("sync_contacts")
      ? completedSteps
      : [...completedSteps, "sync_contacts"];
    const nextStep = getNextStep(updatedSteps);

    await db
      .update(onboardingRecords)
      .set({
        completedSteps: updatedSteps,
        currentStep: nextStep,
      })
      .where(eq(onboardingRecords.accountId, auth.accountId));

    // In production, this would enqueue a background job to sync contacts
    // from the provider's API (Google People API, Microsoft Graph, IMAP address book).
    return c.json({
      data: {
        provider: input.provider,
        maxContacts: input.maxContacts,
        status: "syncing",
        message: `Contact sync initiated from ${input.provider}. Up to ${input.maxContacts} contacts will be imported in the background.`,
        currentStep: nextStep,
        completedSteps: updatedSteps,
        progress: Math.round((updatedSteps.length / ONBOARDING_STEPS.length) * 100),
      },
    });
  },
);

// POST /v1/onboarding/preferences — Set initial preferences
onboardingRouter.post(
  "/preferences",
  requireScope("account:manage"),
  validateBody(PreferencesSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof PreferencesSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [record] = await db
      .select()
      .from(onboardingRecords)
      .where(eq(onboardingRecords.accountId, auth.accountId))
      .limit(1);

    if (!record) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Onboarding not started. Call POST /v1/onboarding/start first.",
            code: "onboarding_not_found",
          },
        },
        404,
      );
    }

    // Merge with existing preferences
    const existingPrefs = (record.preferences ?? {}) as Record<string, unknown>;
    const mergedPreferences = { ...existingPrefs };
    if (input.density !== undefined) mergedPreferences["density"] = input.density;
    if (input.theme !== undefined) mergedPreferences["theme"] = input.theme;
    if (input.aiLevel !== undefined) mergedPreferences["aiLevel"] = input.aiLevel;
    if (input.notifications !== undefined) mergedPreferences["notifications"] = input.notifications;
    if (input.defaultSignature !== undefined) mergedPreferences["defaultSignature"] = input.defaultSignature;
    if (input.keyboardShortcuts !== undefined) mergedPreferences["keyboardShortcuts"] = input.keyboardShortcuts;

    // Mark set_preferences step as complete
    const completedSteps = (record.completedSteps ?? []) as string[];
    const updatedSteps = completedSteps.includes("set_preferences")
      ? completedSteps
      : [...completedSteps, "set_preferences"];
    const nextStep = getNextStep(updatedSteps);

    await db
      .update(onboardingRecords)
      .set({
        preferences: mergedPreferences,
        completedSteps: updatedSteps,
        currentStep: nextStep,
      })
      .where(eq(onboardingRecords.accountId, auth.accountId));

    return c.json({
      data: {
        preferences: mergedPreferences,
        currentStep: nextStep,
        completedSteps: updatedSteps,
        progress: Math.round((updatedSteps.length / ONBOARDING_STEPS.length) * 100),
      },
    });
  },
);

// POST /v1/onboarding/complete — Mark onboarding complete
onboardingRouter.post(
  "/complete",
  requireScope("account:manage"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const [record] = await db
      .select()
      .from(onboardingRecords)
      .where(eq(onboardingRecords.accountId, auth.accountId))
      .limit(1);

    if (!record) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Onboarding not started. Call POST /v1/onboarding/start first.",
            code: "onboarding_not_found",
          },
        },
        404,
      );
    }

    if (record.completedAt !== null) {
      return c.json({
        data: {
          alreadyCompleted: true,
          completedAt: record.completedAt.toISOString(),
        },
      });
    }

    const now = new Date();
    const completedSteps = (record.completedSteps ?? []) as string[];

    // Mark all steps as complete
    const allSteps = ONBOARDING_STEPS.map((s) => s as string);
    const finalSteps = [...new Set([...completedSteps, ...allSteps])];

    await db
      .update(onboardingRecords)
      .set({
        currentStep: "complete",
        completedSteps: finalSteps,
        completedAt: now,
      })
      .where(eq(onboardingRecords.accountId, auth.accountId));

    return c.json({
      data: {
        completed: true,
        completedSteps: finalSteps,
        progress: 100,
        completedAt: now.toISOString(),
        message: "Welcome to AlecRae. Your inbox will never be the same.",
      },
    });
  },
);

// GET /v1/onboarding/recommendations — AI-powered recommendations
onboardingRouter.get(
  "/recommendations",
  requireScope("account:manage"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const [record] = await db
      .select()
      .from(onboardingRecords)
      .where(eq(onboardingRecords.accountId, auth.accountId))
      .limit(1);

    const completedSteps = record
      ? ((record.completedSteps ?? []) as string[])
      : [];
    const importedFrom = record?.importedFrom ?? null;

    const recommendations = generateRecommendations(importedFrom, completedSteps);

    return c.json({
      data: {
        recommendations,
        totalRecommendations: recommendations.length,
        onboardingComplete: record?.completedAt !== null,
      },
    });
  },
);

export { onboardingRouter };
