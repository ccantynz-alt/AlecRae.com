import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/register",
  "/privacy",
  "/terms",
  "/cookies",
  "/dpa",
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
