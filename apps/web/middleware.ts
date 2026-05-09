import { NextResponse, type NextRequest } from "next/server";

/**
 * Auth gate for the marketing + dashboard surfaces.
 *
 * Default-allow with a specific-deny prefix list. Pre-launch, the site
 * is mostly public — landing, legal, roadmap, admin preview, security,
 * bounty, your-ai, etc. — and only the authenticated dashboard sections
 * are gated.
 *
 * Why this shape: the previous default-deny version inadvertently
 * gated every new page (admin preview, roadmap, your-ai, security/bounty,
 * most legal pages) behind a session cookie that the auth flow can't
 * yet issue. Pages were unreachable. This version fails open for
 * marketing/legal/preview routes and only redirects when a user tries
 * to enter their actual mailbox.
 */

// Routes that REQUIRE a logged-in session. Add prefixes here as new
// dashboard areas land. Anything not in this list is public.
const PROTECTED_PREFIXES: readonly string[] = [
  "/inbox",
  "/sent",
  "/drafts",
  "/compose",
  "/settings",
  "/contacts",
  "/templates",
  "/domains",
  "/analytics",
  "/onboarding",
  "/snoozed",
];

function isProtected(pathname: string): boolean {
  for (const prefix of PROTECTED_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Static, Next internals, API, and asset paths always pass.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Public-by-default. Only protected routes need a session.
  if (!isProtected(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get("alecrae_session")?.value;
  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
