import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/**
 * Single-owner gate. Every route needs the session cookie except /login, /mcp (bearer auth of its own) and static
 * assets. Server actions POST to page routes, so they are covered too.
 */
export async function proxy(req: NextRequest) {
  const ok = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();
  if (req.method !== "GET" && req.method !== "HEAD") return new NextResponse("Unauthorized", { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|mcp|_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};
