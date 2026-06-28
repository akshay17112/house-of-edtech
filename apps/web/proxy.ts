/**
 * Proxy (formerly "middleware" in Next 15 — renamed in Next 16).
 *
 * Runs on every matched request. We use it ONLY for cheap, optimistic auth
 * redirects based on the session cookie — no database access here, because
 * the proxy runs on prefetches too and DB calls would hurt performance.
 *
 * The REAL authorization (can THIS user touch THIS document?) happens later
 * in the Data Access Layer (lib/dal.ts), close to the data. The proxy is a
 * first gate, not the only one.
 */
import { auth } from "@/auth";
import { NextResponse } from "next/server";

// Routes that require a logged-in user.
const PROTECTED_PREFIXES = ["/documents"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  const needsAuth = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  // Not logged in and visiting a protected route → bounce to /login.
  if (needsAuth && !isLoggedIn) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  // Already logged in and visiting /login → send to the app.
  if (isLoggedIn && pathname === "/login") {
    return NextResponse.redirect(new URL("/documents", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  // Run on everything except static assets and the auth API itself.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
