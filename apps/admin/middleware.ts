/**
 * Admin route gate.
 *
 * Allows: /login, /api/login, /api/logout, Next.js internals, static assets.
 * Everything else requires a valid signed session cookie.
 */

import { NextResponse, type NextRequest } from "next/server";
import { verifySessionEdge } from "./lib/auth-edge";

const ADMIN_SESSION_COOKIE = "alecrae_admin_session";

const PUBLIC_PATHS: readonly string[] = ["/login", "/api/login", "/api/logout"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname === "/favicon.ico" || pathname === "/robots.txt") return true;
  return false;
}

export async function middleware(req: NextRequest): Promise<Response> {
  const { pathname, search } = req.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const secret = process.env.ADMIN_SESSION_SECRET;
  const session = await verifySessionEdge(token, secret);

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") {
      url.searchParams.set("next", pathname + search);
    }
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match everything except static assets and the public paths
    "/((?!_next/static|_next/image|favicon.ico|robots.txt).*)",
  ],
};
