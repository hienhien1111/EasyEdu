import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Role → home page mapping
const ROLE_HOME: Record<string, string> = {
  ADMIN: "/admin/dashboard",
  TEACHER: "/teacher/classes",
  STUDENT: "/student/my-schedule",
};

// Protected route prefixes and the role that may access them
const ROUTE_ROLE: Record<string, string> = {
  "/admin": "ADMIN",
  "/teacher": "TEACHER",
  "/student": "STUDENT",
};

// Pages that should redirect to dashboard when already authenticated
const AUTH_PATHS = ["/login", "/register", "/forgot-password"];

/**
 * Lightweight JWT decode (no signature verification).
 * Verification happens on the API for every actual data request.
 * We only need the payload for redirect decisions.
 */
function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    // Edge Runtime has atob natively
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("access_token")?.value;
  const isAuthPath = AUTH_PATHS.some((p) => pathname === p);

  // ── Auth pages (login / register / forgot-password) ──────────
  if (isAuthPath) {
    if (!token) return NextResponse.next();

    const payload = decodeJwtPayload(token);
    // Token exists and not yet expired → redirect to role dashboard
    if (payload && typeof payload.exp === "number" && payload.exp > Date.now() / 1000) {
      const home = ROLE_HOME[payload.role as string] ?? "/";
      return NextResponse.redirect(new URL(home, request.url));
    }
    // Expired token → let user stay on auth page (refresh flow will handle it later)
    return NextResponse.next();
  }

  // ── Protected routes (/admin, /teacher, /student, /profile) ──
  const routePrefix = Object.keys(ROUTE_ROLE).find((p) =>
    pathname.startsWith(p)
  );
  const isProtected = !!routePrefix || pathname.startsWith("/profile");

  if (!isProtected) return NextResponse.next();

  // No cookie at all → redirect to login
  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const payload = decodeJwtPayload(token);

  // Cannot parse token → treat as unauthenticated
  if (!payload) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Token expired → allow through (frontend refresh interceptor will handle 401)
  const isExpired =
    typeof payload.exp === "number" && payload.exp <= Date.now() / 1000;
  if (isExpired) {
    return NextResponse.next();
  }

  // Wrong role for this route → redirect to correct home
  if (routePrefix) {
    const requiredRole = ROUTE_ROLE[routePrefix];
    if (payload.role !== requiredRole) {
      const home = ROLE_HOME[payload.role as string] ?? "/login";
      return NextResponse.redirect(new URL(home, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/teacher/:path*",
    "/student/:path*",
    "/profile/:path*",
    "/login",
    "/register",
    "/forgot-password",
  ],
};
