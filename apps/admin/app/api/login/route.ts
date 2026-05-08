/**
 * POST /api/login — verify admin email + password and set session cookie.
 *
 * Returns 200 with `{ ok: true }` on success and a Set-Cookie header.
 * Returns 401 with `{ ok: false, reason }` on failure.
 * Returns 503 if env vars not configured.
 */

import { NextResponse } from "next/server";
import { attemptLogin } from "../../../lib/auth-password";

export const runtime = "nodejs";

interface LoginBody {
  readonly email?: unknown;
  readonly password?: unknown;
}

export async function POST(req: Request): Promise<Response> {
  let body: LoginBody;
  try {
    body = (await req.json()) as LoginBody;
  } catch {
    return NextResponse.json(
      { ok: false, reason: "invalid_request" },
      { status: 400 },
    );
  }

  if (typeof body.email !== "string" || typeof body.password !== "string") {
    return NextResponse.json(
      { ok: false, reason: "invalid_request" },
      { status: 400 },
    );
  }

  const result = attemptLogin(body.email, body.password);

  if (!result.ok) {
    const status = result.reason === "not_configured" ? 503 : 401;
    return NextResponse.json({ ok: false, reason: result.reason }, { status });
  }

  const res = NextResponse.json({ ok: true }, { status: 200 });
  res.headers.set("Set-Cookie", result.cookie);
  return res;
}
