import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/register",
  "/forgot-password",
  // Google sign-in lands here with the session token in the URL fragment; the
  // client reads it and stores the session. Must be public, or the SSR guard
  // bounces to /login before the token can ever be read (the fragment is
  // server-invisible) — leaving Google users stuck at the login page.
  "/google/callback",
  "/privacy",
  "/terms",
  "/cookies",
  "/dpa",
  "/dpa/sign",
  "/sla",
  "/dmca",
  "/acceptable-use",
  "/subprocessors",
]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  // Allow static files and API routes
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Check for auth token in cookies
  const token = request.cookies.get("alecrae_session")?.value;

  if (!token) {
    // Redirect to login with return URL
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
