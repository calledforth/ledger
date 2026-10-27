import { NextResponse, type NextRequest } from "next/server";
import { verifyOwnerPassword } from "@/lib/password";
import { createSessionToken, SESSION_MAX_AGE } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Token login for the mobile app: POST { password } → { token, expires_in }. The token is the same session JWT the
 * dashboard cookie carries; send it as `Authorization: Bearer <token>` to every /api route.
 */
export async function POST(req: NextRequest) {
  let password = "";
  try {
    const body = (await req.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Send JSON: { password }" }, { status: 400 });
  }
  if (!(await verifyOwnerPassword(password))) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing, same as the form login
    return NextResponse.json({ error: "That password didn't match." }, { status: 401 });
  }
  return NextResponse.json({ token: await createSessionToken(), expires_in: SESSION_MAX_AGE }, { headers: { "Cache-Control": "no-store" } });
}
