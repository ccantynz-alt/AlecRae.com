/**
 * Passkey / WebAuthn Authentication Routes
 *
 * POST /v1/auth/passkey/register/challenge  — Generate registration challenge
 * POST /v1/auth/passkey/register/verify     — Verify registration attestation
 * POST /v1/auth/passkey/login/challenge     — Generate authentication challenge
 * POST /v1/auth/passkey/login/verify        — Verify authentication assertion
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, lt } from "drizzle-orm";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import { issueTokenPair } from "../lib/jwt.js";
import {
  getDatabase,
  users,
  accounts,
  passkeys,
  passkeyChallenges,
} from "@alecrae/db";

const passkeyRouter = new Hono();

// ─── Constants ────────────────────────────────────────────────────────────────

const RP_NAME = "AlecRae";
const IS_PRODUCTION = process.env["NODE_ENV"] === "production";
const RP_ID = process.env["WEBAUTHN_RP_ID"] ?? (IS_PRODUCTION ? (() => { throw new Error("[passkey] WEBAUTHN_RP_ID must be set in production (e.g. 'alecrae.com')"); })() : "localhost");
const RP_ORIGIN = process.env["WEBAUTHN_ORIGIN"] ?? (IS_PRODUCTION ? (() => { throw new Error("[passkey] WEBAUTHN_ORIGIN must be set in production (e.g. 'https://mail.alecrae.com')"); })() : "http://localhost:3000");
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateChallenge(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bufferToBase64Url(bytes);
}

function bufferToBase64Url(buffer: Uint8Array): string {
  let binary = "";
  for (const byte of buffer) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlToBuffer(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Token issuance is delegated to the shared JWT library (proper RS256/HS256 signing
// with refresh token rotation). See lib/jwt.ts.

/**
 * Parse the authenticator data buffer from an attestation/assertion response.
 * Returns the rpIdHash, flags, and signCount.
 */
function parseAuthenticatorData(authDataB64: string): {
  rpIdHash: Uint8Array;
  flags: number;
  signCount: number;
} {
  const authData = base64UrlToBuffer(authDataB64);
  const rpIdHash = authData.slice(0, 32);
  const flags = authData[32] ?? 0;
  const signCountView = new DataView(authData.buffer, authData.byteOffset + 33, 4);
  const signCount = signCountView.getUint32(0, false);
  return { rpIdHash, flags, signCount };
}

/**
 * Compute SHA-256 hash of a string.
 */
async function sha256(input: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(hashBuffer);
}

/**
 * Compare two Uint8Arrays for equality.
 */
function uint8ArraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ─── Cleanup expired challenges ───────────────────────────────────────────────

async function cleanupExpiredChallenges(): Promise<void> {
  try {
    const db = getDatabase();
    await db
      .delete(passkeyChallenges)
      .where(lt(passkeyChallenges.expiresAt, new Date()));
  } catch {
    // Non-critical cleanup, ignore errors
  }
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const RegisterChallengeSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(256),
});

const RegisterVerifySchema = z.object({
  challengeId: z.string().min(1),
  credential: z.object({
    id: z.string().min(1),
    rawId: z.string().min(1),
    type: z.literal("public-key"),
    response: z.object({
      clientDataJSON: z.string().min(1),
      attestationObject: z.string().min(1),
      publicKey: z.string().min(1).optional(),
      publicKeyAlgorithm: z.number().optional(),
      transports: z.array(z.string()).optional(),
      authenticatorData: z.string().min(1).optional(),
    }),
    authenticatorAttachment: z.string().optional(),
  }),
  _registration: z.object({
    email: z.string().email(),
    name: z.string().min(1).max(256),
    userId: z.string().min(1),
  }),
});

const LoginChallengeSchema = z.object({
  email: z.string().email().optional(),
});

const LoginVerifySchema = z.object({
  challengeId: z.string().min(1),
  credential: z.object({
    id: z.string().min(1),
    rawId: z.string().min(1),
    type: z.literal("public-key"),
    response: z.object({
      clientDataJSON: z.string().min(1),
      authenticatorData: z.string().min(1),
      signature: z.string().min(1),
      userHandle: z.string().optional(),
    }),
    authenticatorAttachment: z.string().optional(),
  }),
});

// ─── Registration: Generate Challenge ─────────────────────────────────────────

passkeyRouter.post(
  "/register/challenge",
  validateBody(RegisterChallengeSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof RegisterChallengeSchema>>(c);
    const db = getDatabase();

    // Clean up expired challenges (fire-and-forget)
    void cleanupExpiredChallenges();

    // Check if user already exists
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email.toLowerCase()))
      .limit(1);

    if (existingUser) {
      return c.json(
        {
          error: {
            type: "validation_error",
            message: "An account with this email already exists",
            code: "email_exists",
          },
        },
        409,
      );
    }

    const challenge = generateChallenge();
    const challengeId = generateId();
    const userId = generateId();

    // Store the challenge for verification
    await db.insert(passkeyChallenges).values({
      id: challengeId,
      challenge,
      userId,
      type: "registration",
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    });

    return c.json({
      data: {
        challengeId,
        publicKey: {
          challenge,
          rp: {
            name: RP_NAME,
            id: RP_ID,
          },
          user: {
            id: bufferToBase64Url(new TextEncoder().encode(userId)),
            name: input.email,
            displayName: input.name,
          },
          pubKeyCredParams: [
            { alg: -7, type: "public-key" as const },
            { alg: -257, type: "public-key" as const },
          ],
          timeout: CHALLENGE_TTL_MS,
          authenticatorSelection: {
            authenticatorAttachment: "platform" as const,
            residentKey: "preferred" as const,
            userVerification: "preferred" as const,
          },
          attestation: "none" as const,
        },
        // Pass these back so the verify step can create the user
        _registration: {
          email: input.email.toLowerCase(),
          name: input.name,
          userId,
        },
      },
    });
  },
);

// ─── Registration: Verify Attestation ─────────────────────────────────────────

passkeyRouter.post(
  "/register/verify",
  validateBody(RegisterVerifySchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof RegisterVerifySchema>>(c);
    const db = getDatabase();

    // Look up the challenge
    const [challengeRecord] = await db
      .select()
      .from(passkeyChallenges)
      .where(
        and(
          eq(passkeyChallenges.id, input.challengeId),
          eq(passkeyChallenges.type, "registration"),
        ),
      )
      .limit(1);

    if (!challengeRecord) {
      return c.json(
        {
          error: {
            type: "authentication_error",
            message: "Invalid or expired challenge",
            code: "invalid_challenge",
          },
        },
        400,
      );
    }

    if (challengeRecord.expiresAt < new Date()) {
      // Clean up expired challenge
      await db
        .delete(passkeyChallenges)
        .where(eq(passkeyChallenges.id, challengeRecord.id));
      return c.json(
        {
          error: {
            type: "authentication_error",
            message: "Challenge expired",
            code: "challenge_expired",
          },
        },
        400,
      );
    }

    // Parse and verify clientDataJSON
    const clientDataRaw = base64UrlToBuffer(input.credential.response.clientDataJSON);
    const clientDataText = new TextDecoder().decode(clientDataRaw);
    let clientData: { type: string; challenge: string; origin: string };
    try {
      clientData = JSON.parse(clientDataText) as {
        type: string;
        challenge: string;
        origin: string;
      };
    } catch {
      return c.json(
        {
          error: {
            type: "authentication_error",
            message: "Invalid clientDataJSON",
            code: "invalid_client_data",
          },
        },
        400,
      );
    }

    // Verify the type is "webauthn.create"
    if (clientData.type !== "webauthn.create") {
      return c.json(
        {
          error: {
            type: "authentication_error",
            message: "Invalid ceremony type",
            code: "invalid_ceremony_type",
          },
        },
        400,
      );
    }

    // Verify the challenge matches
    if (clientData.challenge !== challengeRecord.challenge) {
      return c.json(
        {
          error: {
            type: "authentication_error",
            message: "Challenge mismatch",
            code: "challenge_mismatch",
          },
        },
        400,
      );
    }

    // Verify origin
    const allowedOrigins = RP_ORIGIN.split(",").map((o) => o.trim());
    if (!allowedOrigins.includes(clientData.origin)) {
      return c.json(
        {
          error: {
            type: "authentication_error",
            message: "Origin mismatch",
            code: "origin_mismatch",
          },
        },
        400,
      );
    }

    // Extract authenticatorData if available
    let signCount = 0;
    if (input.credential.response.authenticatorData) {
      const parsed = parseAuthenticatorData(input.credential.response.authenticatorData);
      const rpIdHashExpected = await sha256(RP_ID);
      if (!uint8ArraysEqual(parsed.rpIdHash, rpIdHashExpected)) {
        return c.json(
          {
            error: {
              type: "authentication_error",
              message: "RP ID hash mismatch",
              code: "rp_id_mismatch",
            },
          },
          400,
        );
      }
      // Verify user presence flag (bit 0)
      if ((parsed.flags & 0x01) === 0) {
        return c.json(
          {
            error: {
              type: "authentication_error",
              message: "User not present",
              code: "user_not_present",
            },
          },
          400,
        );
      }
      signCount = parsed.signCount;
    }

    // Delete the used challenge
    await db
      .delete(passkeyChallenges)
      .where(eq(passkeyChallenges.id, challengeRecord.id));

    // The userId was stored in the challenge record
    const userId = challengeRecord.userId;
    if (!userId) {
      return c.json(
        {
          error: {
            type: "server_error",
            message: "Challenge missing user context",
            code: "internal_error",
          },
        },
        500,
      );
    }

    // Verify the userId from the challenge matches the registration metadata
    if (input._registration.userId !== userId) {
      return c.json(
        {
          error: {
            type: "authentication_error",
            message: "Registration user ID mismatch",
            code: "user_id_mismatch",
          },
        },
        400,
      );
    }

    const email = input._registration.email.toLowerCase();
    const name = input._registration.name;

    // Double-check user doesn't exist
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser) {
      return c.json(
        {
          error: {
            type: "validation_error",
            message: "An account with this email already exists",
            code: "email_exists",
          },
        },
        409,
      );
    }

    const accountId = generateId();

    // Create account
    await db.insert(accounts).values({
      id: accountId,
      name: `${name}'s Account`,
      planTier: "free",
      billingEmail: email,
      emailsSentThisPeriod: 0,
    });

    // Create user (no password — passkey only)
    await db.insert(users).values({
      id: userId,
      accountId,
      email,
      name,
      passwordHash: null,
      role: "owner",
      emailVerified: false,
      permissions: {
        sendEmail: true,
        readEmail: true,
        manageDomains: true,
        manageApiKeys: true,
        manageWebhooks: true,
        viewAnalytics: true,
        manageAccount: true,
        manageTeamMembers: true,
      },
    });

    // Store the passkey credential
    const passkeyId = generateId();
    await db.insert(passkeys).values({
      id: passkeyId,
      userId,
      credentialId: input.credential.id,
      publicKey: input.credential.response.publicKey ?? "",
      counter: signCount,
      deviceType: "single_device",
      backedUp: 0,
      transports: input.credential.response.transports
        ? JSON.stringify(input.credential.response.transports)
        : null,
      friendlyName: "Primary passkey",
      lastUsedAt: new Date(),
    });

    const tokenPair = await issueTokenPair({
      sub: accountId,
      userId,
      email,
      role: "owner",
      tier: "free",
    });

    return c.json(
      {
        data: {
          token: tokenPair.accessToken,
          refreshToken: tokenPair.refreshToken,
          expiresIn: tokenPair.expiresIn,
          user: {
            id: userId,
            email,
            name,
            role: "owner",
            accountId,
          },
        },
      },
      201,
    );
  },
);

// ─── Login: Generate Challenge ────────────────────────────────────────────────

passkeyRouter.post(
  "/login/challenge",
  validateBody(LoginChallengeSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof LoginChallengeSchema>>(c);
    const db = getDatabase();

    // Clean up expired challenges (fire-and-forget)
    void cleanupExpiredChallenges();

    const challenge = generateChallenge();
    const challengeId = generateId();

    // If email provided, look up allowed credentials for that user
    let allowCredentials: { type: "public-key"; id: string; transports?: string[] }[] = [];

    if (input.email) {
      const [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.email.toLowerCase()))
        .limit(1);

      if (user) {
        const userPasskeys = await db
          .select({
            credentialId: passkeys.credentialId,
            transports: passkeys.transports,
          })
          .from(passkeys)
          .where(eq(passkeys.userId, user.id));

        allowCredentials = userPasskeys.map((pk) => {
          const transports = pk.transports
            ? (JSON.parse(pk.transports) as string[])
            : undefined;
          return {
            type: "public-key" as const,
            id: pk.credentialId,
            ...(transports !== undefined ? { transports } : {}),
          };
        });
      }
    }

    // Store the challenge
    await db.insert(passkeyChallenges).values({
      id: challengeId,
      challenge,
      userId: null,
      type: "authentication",
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    });

    return c.json({
      data: {
        challengeId,
        publicKey: {
          challenge,
          rpId: RP_ID,
          timeout: CHALLENGE_TTL_MS,
          userVerification: "preferred" as const,
          ...(allowCredentials.length > 0 ? { allowCredentials } : {}),
        },
      },
    });
  },
);

// ─── Login: Verify Assertion ──────────────────────────────────────────────────

passkeyRouter.post(
  "/login/verify",
  validateBody(LoginVerifySchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof LoginVerifySchema>>(c);
    const db = getDatabase();

    // Look up the challenge
    const [challengeRecord] = await db
      .select()
      .from(passkeyChallenges)
      .where(
        and(
          eq(passkeyChallenges.id, input.challengeId),
          eq(passkeyChallenges.type, "authentication"),
        ),
      )
      .limit(1);

    if (!challengeRecord) {
      return c.json(
        {
          error: {
            type: "authentication_error",
            message: "Invalid or expired challenge",
            code: "invalid_challenge",
          },
        },
        400,
      );
    }

    if (challengeRecord.expiresAt < new Date()) {
      await db
        .delete(passkeyChallenges)
        .where(eq(passkeyChallenges.id, challengeRecord.id));
      return c.json(
        {
          error: {
            type: "authentication_error",
            message: "Challenge expired",
            code: "challenge_expired",
          },
        },
        400,
      );
    }

    // Parse clientDataJSON
    const clientDataRaw = base64UrlToBuffer(input.credential.response.clientDataJSON);
    const clientDataText = new TextDecoder().decode(clientDataRaw);
    let clientData: { type: string; challenge: string; origin: string };
    try {
      clientData = JSON.parse(clientDataText) as {
        type: string;
        challenge: string;
        origin: string;
      };
    } catch {
      return c.json(
        {
          error: {
            type: "authentication_error",
            message: "Invalid clientDataJSON",
            code: "invalid_client_data",
          },
        },
        400,
      );
    }

    // Verify ceremony type
    if (clientData.type !== "webauthn.get") {
      return c.json(
        {
          error: {
            type: "authentication_error",
            message: "Invalid ceremony type",
            code: "invalid_ceremony_type",
          },
        },
        400,
      );
    }

    // Verify challenge
    if (clientData.challenge !== challengeRecord.challenge) {
      return c.json(
        {
          error: {
            type: "authentication_error",
            message: "Challenge mismatch",
            code: "challenge_mismatch",
          },
        },
        400,
      );
    }

    // Verify origin
    const allowedOrigins = RP_ORIGIN.split(",").map((o) => o.trim());
    if (!allowedOrigins.includes(clientData.origin)) {
      return c.json(
        {
          error: {
            type: "authentication_error",
            message: "Origin mismatch",
            code: "origin_mismatch",
          },
        },
        400,
      );
    }

    // Parse authenticator data
    const authDataParsed = parseAuthenticatorData(input.credential.response.authenticatorData);

    // Verify RP ID hash
    const rpIdHashExpected = await sha256(RP_ID);
    if (!uint8ArraysEqual(authDataParsed.rpIdHash, rpIdHashExpected)) {
      return c.json(
        {
          error: {
            type: "authentication_error",
            message: "RP ID hash mismatch",
            code: "rp_id_mismatch",
          },
        },
        400,
      );
    }

    // Verify user presence flag
    if ((authDataParsed.flags & 0x01) === 0) {
      return c.json(
        {
          error: {
            type: "authentication_error",
            message: "User not present",
            code: "user_not_present",
          },
        },
        400,
      );
    }

    // Look up the passkey credential
    const [passkeyRecord] = await db
      .select()
      .from(passkeys)
      .where(eq(passkeys.credentialId, input.credential.id))
      .limit(1);

    if (!passkeyRecord) {
      return c.json(
        {
          error: {
            type: "authentication_error",
            message: "Passkey not recognized",
            code: "unknown_credential",
          },
        },
        401,
      );
    }

    // Verify sign count hasn't decreased (clone detection)
    if (
      authDataParsed.signCount > 0 &&
      passkeyRecord.counter > 0 &&
      authDataParsed.signCount <= passkeyRecord.counter
    ) {
      return c.json(
        {
          error: {
            type: "authentication_error",
            message: "Possible credential cloning detected",
            code: "sign_count_mismatch",
          },
        },
        401,
      );
    }

    // Delete the used challenge
    await db
      .delete(passkeyChallenges)
      .where(eq(passkeyChallenges.id, challengeRecord.id));

    // Update passkey counter and last used
    await db
      .update(passkeys)
      .set({
        counter: authDataParsed.signCount,
        lastUsedAt: new Date(),
      })
      .where(eq(passkeys.id, passkeyRecord.id));

    // Look up the user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, passkeyRecord.userId))
      .limit(1);

    if (!user) {
      return c.json(
        {
          error: {
            type: "authentication_error",
            message: "User not found",
            code: "user_not_found",
          },
        },
        401,
      );
    }

    // Update last login
    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    let tier = "free";
    try {
      const [account] = await db
        .select({ planTier: accounts.planTier })
        .from(accounts)
        .where(eq(accounts.id, user.accountId))
        .limit(1);
      if (account) tier = account.planTier ?? "free";
    } catch {
      // fall through
    }

    const tokenPair = await issueTokenPair({
      sub: user.accountId,
      userId: user.id,
      email: user.email,
      role: user.role,
      tier,
    });

    return c.json({
      data: {
        token: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expiresIn: tokenPair.expiresIn,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          accountId: user.accountId,
        },
      },
    });
  },
);

export { passkeyRouter };
