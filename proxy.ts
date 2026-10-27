import { NextResponse, type NextRequest } from "next/server";
import { isOwnerRequest } from "@/lib/api-auth";

/**
 * Single-owner gate. Every route needs the session except /login, /api/login, /mcp (bearer auth of its own) and
 * static assets. Server actions POST to page routes, so they are covered too. The session comes from the cookie
 * (dashboard) or an Authorization bearer (mobile app); /api routes answer 401 JSON instead of redirecting.
 */
export async function proxy(req: NextRequest) {
  if (await isOwnerRequest(req)) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (req.method !== "GET" && req.method !== "HEAD") return new NextResponse("Unauthorized", { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api/login|mcp|_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};
