import { NextResponse } from "next/server";

// BUILD_TIME is set once when the module is first loaded (build time in prod).
const BUILD_TIME = new Date().toISOString();

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      commit: process.env.NEXT_PUBLIC_COMMIT_SHA ?? "dev",
      branch: process.env.NEXT_PUBLIC_BRANCH ?? "unknown",
      builtAt: BUILD_TIME,
      env: process.env.NODE_ENV ?? "unknown",
      ok: true,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
