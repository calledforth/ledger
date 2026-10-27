import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "./session";

/**
 * The owner's session, from either the browser cookie or an `Authorization: Bearer <session token>` header. The
 * mobile app gets its token from POST /api/login and sends it as a bearer; the dashboard keeps using the cookie.
 * Both carry the same signed JWT, so one check covers both.
 */
export async function isOwnerRequest(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySessionToken(cookie)) return true;
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  return m ? verifySessionToken(m[1].trim()) : false;
}
