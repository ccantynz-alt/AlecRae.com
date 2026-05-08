/**
 * POST /api/logout — clear the admin session cookie.
 */

import { NextResponse } from "next/server";
import { clearSessionCookie } from "../../../lib/auth-password";

export const runtime = "nodejs";

export async function POST(): Promise<Response> {
  const res = NextResponse.json({ ok: true }, { status: 200 });
  res.headers.set("Set-Cookie", clearSessionCookie());
  return res;
}
