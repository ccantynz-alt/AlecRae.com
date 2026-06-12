import { NextResponse } from "next/server";

/**
 * Public deployment fingerprint — answers "which build is this domain
 * actually serving?" during deploy/cache debugging.
 *
 * Vercel injects VERCEL_GIT_COMMIT_* at build time; BUILD_TIME is computed
 * once per build because this route is statically evaluated.
 */

const BUILD_TIME = new Date().toISOString();

interface VersionInfo {
  commit: string;
  commitMessage: string;
  branch: string;
  builtAt: string;
  env: string;
}

export function GET(): NextResponse<VersionInfo> {
  return NextResponse.json({
    commit: process.env["VERCEL_GIT_COMMIT_SHA"] ?? "unknown",
    commitMessage: process.env["VERCEL_GIT_COMMIT_MESSAGE"] ?? "unknown",
    branch: process.env["VERCEL_GIT_COMMIT_REF"] ?? "unknown",
    builtAt: BUILD_TIME,
    env: process.env["VERCEL_ENV"] ?? process.env.NODE_ENV ?? "unknown",
  });
}
