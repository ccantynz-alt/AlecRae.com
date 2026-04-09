/**
 * Meetings Route — Full S9: Email thread → meeting transcript link
 *
 * POST /v1/meetings/detect              — Scan a thread for meeting references
 * GET  /v1/meetings/thread/:threadId    — Get meeting links for a thread
 * POST /v1/meetings/:id/link-recording  — Manually attach a recording URL
 * POST /v1/meetings/:id/transcribe      — Trigger transcription (Whisper API)
 * GET  /v1/meetings/:id/summary         — Get AI summary of transcript
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  getValidatedBody,
} from "../middleware/validator.js";
import { getDatabase, emails, meetingLinks } from "@emailed/db";
import { detectMeetingFromThread } from "@emailed/ai-engine/meetings/transcript-linker";
import type { LinkerEmail } from "@emailed/ai-engine/meetings/types";

// ─── Schemas ─────────────────────────────────────────────────────────────────

const ThreadMessageSchema = z.object({
  id: z.string().optional(),
  from: z.string().optional(),
  to: z.array(z.string()).optional(),
  subject: z.string().optional(),
  textBody: z.string().optional(),
  htmlBody: z.string().optional(),
  receivedAt: z.coerce.date().optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string().optional(),
        contentType: z.string().optional(),
        content: z.string().optional(),
      }),
    )
    .optional(),
});

const DetectSchema = z.object({
  threadId: z.string().min(1).max(512),
  thread: z.object({
    messages: z.array(ThreadMessageSchema).min(1).max(200),
  }),
});

const LinkRecordingSchema = z.object({
  recordingUrl: z.string().url().max(4096),
  transcriptUrl: z.string().url().max(4096).optional(),
});

const TranscribeSchema = z.object({
  /** Optional: provide transcript text directly instead of calling Whisper. */
  transcriptText: z.string().max(500_000).optional(),
  /** Optional: audio URL to transcribe via Whisper API. */
  audioUrl: z.string().url().max(4096).optional(),
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateId(): string {
  return `ml_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Generate an AI summary of transcript text using Claude Haiku.
 * Falls back to extractive summary if the AI call fails.
 */
async function generateAiSummary(transcriptText: string): Promise<string> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey || transcriptText.length === 0) {
    return extractiveSummary(transcriptText);
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20241022",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Summarize this meeting transcript in 3-5 concise bullet points. Focus on key decisions, action items, and important discussion points. Return ONLY the bullet points, nothing else.\n\nTranscript:\n${transcriptText.slice(0, 12_000)}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      return extractiveSummary(transcriptText);
    }

    const body = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = body.content?.find((b) => b.type === "text")?.text;
    return text ?? extractiveSummary(transcriptText);
  } catch {
    return extractiveSummary(transcriptText);
  }
}

function extractiveSummary(text: string, maxChars = 600): string {
  if (text.length === 0) return "";
  if (text.length <= maxChars) return text;
  const sentences = text.split(/(?<=[.!?])\s+/).slice(0, 4).join(" ");
  return sentences.length > 0 ? sentences.slice(0, maxChars) : text.slice(0, maxChars);
}

// ─── Routes ──────────────────────────────────────────────────────────────────

const meetings = new Hono();

// POST /v1/meetings/detect — scan a thread for meeting links and persist
meetings.post(
  "/detect",
  requireScope("messages:read"),
  validateBody(DetectSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof DetectSchema>>(c);
    const auth = c.get("auth");

    const linkerMessages: LinkerEmail[] = input.thread.messages.map((m) => ({
      id: m.id,
      from: m.from,
      to: m.to,
      subject: m.subject,
      textBody: m.textBody,
      htmlBody: m.htmlBody,
      receivedAt: m.receivedAt,
      attachments: m.attachments,
    }));

    const meeting = await detectMeetingFromThread({ messages: linkerMessages });
    if (!meeting) {
      return c.json({ data: { detected: false, meeting: null } });
    }

    // Persist to DB
    const db = getDatabase();
    const id = generateId();
    const now = new Date();

    await db.insert(meetingLinks).values({
      id,
      accountId: auth.accountId,
      threadId: input.threadId,
      provider: meeting.platform ?? "generic",
      meetingUrl: meeting.meetingUrl ?? null,
      scheduledAt: meeting.scheduledAt ?? null,
      title: meeting.title ?? null,
      confidence: meeting.confidence,
      status: "detected",
      createdAt: now,
      updatedAt: now,
    });

    return c.json({
      data: {
        detected: true,
        meeting: {
          id,
          threadId: input.threadId,
          provider: meeting.platform ?? "generic",
          meetingUrl: meeting.meetingUrl ?? null,
          scheduledAt: meeting.scheduledAt?.toISOString() ?? null,
          title: meeting.title ?? null,
          confidence: meeting.confidence,
          detectedFrom: meeting.detectedFrom,
          status: "detected",
        },
      },
    });
  },
);

// GET /v1/meetings/thread/:threadId — get meeting links for a thread
meetings.get(
  "/thread/:threadId",
  requireScope("messages:read"),
  async (c) => {
    const auth = c.get("auth");
    const threadId = c.req.param("threadId");
    if (!threadId) {
      return c.json(
        {
          error: {
            type: "validation_error",
            message: "threadId is required",
            code: "missing_thread_id",
          },
        },
        400,
      );
    }

    const db = getDatabase();

    // Check for existing persisted meeting links
    const existing = await db
      .select()
      .from(meetingLinks)
      .where(
        and(
          eq(meetingLinks.accountId, auth.accountId),
          eq(meetingLinks.threadId, threadId),
        ),
      )
      .orderBy(desc(meetingLinks.createdAt))
      .limit(10);

    if (existing.length > 0) {
      return c.json({
        data: {
          meetings: existing.map((m) => ({
            id: m.id,
            threadId: m.threadId,
            emailId: m.emailId,
            provider: m.provider,
            meetingUrl: m.meetingUrl,
            scheduledAt: m.scheduledAt?.toISOString() ?? null,
            recordingUrl: m.recordingUrl,
            transcriptUrl: m.transcriptUrl,
            transcriptPreview: m.transcriptText
              ? m.transcriptText.slice(0, 300)
              : null,
            aiSummary: m.aiSummary,
            title: m.title,
            confidence: m.confidence,
            status: m.status,
            participants: m.participants,
            duration: m.duration,
            createdAt: m.createdAt?.toISOString() ?? null,
            updatedAt: m.updatedAt?.toISOString() ?? null,
          })),
        },
      });
    }

    // Auto-detect from thread emails if no persisted records exist
    const threadMessages = await db
      .select({
        id: emails.id,
        subject: emails.subject,
        textBody: emails.textBody,
        htmlBody: emails.htmlBody,
        from: emails.fromAddress,
        createdAt: emails.createdAt,
      })
      .from(emails)
      .where(eq(emails.accountId, auth.accountId))
      .orderBy(desc(emails.createdAt))
      .limit(200);

    // Filter to thread-related messages
    const related = threadMessages.filter(
      (m) => m.id === threadId,
    );

    if (related.length === 0) {
      return c.json({ data: { meetings: [] } });
    }

    const linkerMessages: LinkerEmail[] = related
      .slice()
      .reverse()
      .map((m) => ({
        id: m.id,
        subject: m.subject ?? undefined,
        textBody: m.textBody ?? undefined,
        htmlBody: m.htmlBody ?? undefined,
        from: m.from ?? undefined,
        receivedAt: m.createdAt ?? undefined,
      }));

    const meeting = await detectMeetingFromThread({ messages: linkerMessages });
    if (!meeting) {
      return c.json({ data: { meetings: [] } });
    }

    // Persist the detection
    const id = generateId();
    const now = new Date();
    await db.insert(meetingLinks).values({
      id,
      accountId: auth.accountId,
      threadId,
      provider: meeting.platform ?? "generic",
      meetingUrl: meeting.meetingUrl ?? null,
      scheduledAt: meeting.scheduledAt ?? null,
      title: meeting.title ?? null,
      confidence: meeting.confidence,
      status: "detected",
      createdAt: now,
      updatedAt: now,
    });

    return c.json({
      data: {
        meetings: [
          {
            id,
            threadId,
            emailId: null,
            provider: meeting.platform ?? "generic",
            meetingUrl: meeting.meetingUrl ?? null,
            scheduledAt: meeting.scheduledAt?.toISOString() ?? null,
            recordingUrl: null,
            transcriptUrl: null,
            transcriptPreview: null,
            aiSummary: null,
            title: meeting.title ?? null,
            confidence: meeting.confidence,
            status: "detected",
            participants: null,
            duration: null,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
        ],
      },
    });
  },
);

// POST /v1/meetings/:id/link-recording — manually attach recording URL
meetings.post(
  "/:id/link-recording",
  requireScope("messages:write"),
  validateBody(LinkRecordingSchema),
  async (c) => {
    const auth = c.get("auth");
    const meetingId = c.req.param("id");
    if (!meetingId) {
      return c.json(
        {
          error: {
            type: "validation_error",
            message: "Meeting ID is required",
            code: "missing_meeting_id",
          },
        },
        400,
      );
    }

    const input = getValidatedBody<z.infer<typeof LinkRecordingSchema>>(c);
    const db = getDatabase();

    // Verify the meeting belongs to this account
    const [existing] = await db
      .select({ id: meetingLinks.id, status: meetingLinks.status })
      .from(meetingLinks)
      .where(
        and(
          eq(meetingLinks.id, meetingId),
          eq(meetingLinks.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Meeting ${meetingId} not found`,
            code: "meeting_not_found",
          },
        },
        404,
      );
    }

    const now = new Date();
    await db
      .update(meetingLinks)
      .set({
        recordingUrl: input.recordingUrl,
        transcriptUrl: input.transcriptUrl ?? null,
        status: "linked",
        updatedAt: now,
      })
      .where(eq(meetingLinks.id, meetingId));

    return c.json({
      data: {
        id: meetingId,
        recordingUrl: input.recordingUrl,
        transcriptUrl: input.transcriptUrl ?? null,
        status: "linked",
        updatedAt: now.toISOString(),
      },
    });
  },
);

// POST /v1/meetings/:id/transcribe — trigger transcription
meetings.post(
  "/:id/transcribe",
  requireScope("messages:write"),
  validateBody(TranscribeSchema),
  async (c) => {
    const auth = c.get("auth");
    const meetingId = c.req.param("id");
    if (!meetingId) {
      return c.json(
        {
          error: {
            type: "validation_error",
            message: "Meeting ID is required",
            code: "missing_meeting_id",
          },
        },
        400,
      );
    }

    const input = getValidatedBody<z.infer<typeof TranscribeSchema>>(c);
    const db = getDatabase();

    // Verify ownership
    const [existing] = await db
      .select({
        id: meetingLinks.id,
        recordingUrl: meetingLinks.recordingUrl,
        transcriptText: meetingLinks.transcriptText,
      })
      .from(meetingLinks)
      .where(
        and(
          eq(meetingLinks.id, meetingId),
          eq(meetingLinks.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Meeting ${meetingId} not found`,
            code: "meeting_not_found",
          },
        },
        404,
      );
    }

    let transcriptText = input.transcriptText ?? "";

    // If transcript text was not provided directly, attempt Whisper transcription
    if (!transcriptText) {
      const audioUrl = input.audioUrl ?? existing.recordingUrl;
      if (!audioUrl) {
        return c.json(
          {
            error: {
              type: "validation_error",
              message:
                "No transcript text, audio URL, or recording URL available for transcription",
              code: "no_audio_source",
            },
          },
          400,
        );
      }

      const openaiKey = process.env["OPENAI_API_KEY"];
      if (!openaiKey) {
        return c.json(
          {
            error: {
              type: "service_unavailable",
              message: "Whisper transcription is not configured",
              code: "whisper_not_configured",
            },
          },
          503,
        );
      }

      try {
        // Download the audio file
        const audioRes = await fetch(audioUrl);
        if (!audioRes.ok) {
          return c.json(
            {
              error: {
                type: "upstream_error",
                message: `Failed to fetch audio from ${audioUrl}: ${audioRes.status}`,
                code: "audio_fetch_failed",
              },
            },
            502,
          );
        }

        const audioBlob = await audioRes.blob();
        const formData = new FormData();
        formData.append("file", audioBlob, "meeting.mp4");
        formData.append("model", "whisper-1");
        formData.append("response_format", "text");

        const whisperRes = await fetch(
          "https://api.openai.com/v1/audio/transcriptions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${openaiKey}`,
            },
            body: formData,
          },
        );

        if (!whisperRes.ok) {
          const errText = await whisperRes.text();
          return c.json(
            {
              error: {
                type: "upstream_error",
                message: `Whisper API error: ${whisperRes.status} — ${errText.slice(0, 200)}`,
                code: "whisper_error",
              },
            },
            502,
          );
        }

        transcriptText = await whisperRes.text();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Transcription failed";
        return c.json(
          {
            error: {
              type: "service_error",
              message,
              code: "transcription_failed",
            },
          },
          500,
        );
      }
    }

    const now = new Date();
    await db
      .update(meetingLinks)
      .set({
        transcriptText,
        status: "transcribed",
        updatedAt: now,
      })
      .where(eq(meetingLinks.id, meetingId));

    return c.json({
      data: {
        id: meetingId,
        transcriptPreview: transcriptText.slice(0, 500),
        transcriptLength: transcriptText.length,
        status: "transcribed",
        updatedAt: now.toISOString(),
      },
    });
  },
);

// GET /v1/meetings/:id/summary — get AI summary of transcript
meetings.get(
  "/:id/summary",
  requireScope("messages:read"),
  async (c) => {
    const auth = c.get("auth");
    const meetingId = c.req.param("id");
    if (!meetingId) {
      return c.json(
        {
          error: {
            type: "validation_error",
            message: "Meeting ID is required",
            code: "missing_meeting_id",
          },
        },
        400,
      );
    }

    const db = getDatabase();

    const [existing] = await db
      .select({
        id: meetingLinks.id,
        transcriptText: meetingLinks.transcriptText,
        aiSummary: meetingLinks.aiSummary,
        status: meetingLinks.status,
        title: meetingLinks.title,
      })
      .from(meetingLinks)
      .where(
        and(
          eq(meetingLinks.id, meetingId),
          eq(meetingLinks.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Meeting ${meetingId} not found`,
            code: "meeting_not_found",
          },
        },
        404,
      );
    }

    // Return cached summary if already generated
    if (existing.aiSummary) {
      return c.json({
        data: {
          id: meetingId,
          title: existing.title,
          summary: existing.aiSummary,
          status: existing.status,
          cached: true,
        },
      });
    }

    // Need transcript to generate summary
    if (!existing.transcriptText) {
      return c.json(
        {
          error: {
            type: "precondition_failed",
            message:
              "Transcript not available. Transcribe the meeting first via POST /v1/meetings/:id/transcribe",
            code: "no_transcript",
          },
        },
        412,
      );
    }

    // Generate summary using Claude Haiku
    const summary = await generateAiSummary(existing.transcriptText);

    const now = new Date();
    await db
      .update(meetingLinks)
      .set({
        aiSummary: summary,
        status: "summarized",
        updatedAt: now,
      })
      .where(eq(meetingLinks.id, meetingId));

    return c.json({
      data: {
        id: meetingId,
        title: existing.title,
        summary,
        status: "summarized",
        cached: false,
      },
    });
  },
);

export { meetings };
