import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { isMonth, loadMonth } from "../../dashboard/load";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

/** One month of dashboard data as JSON, so the dashboard can switch and prefetch months without a page render. */
export async function GET(req: NextRequest) {
  // proxy.ts already gates this route; answer 401 JSON rather than a login redirect if a session expires mid-use.
  if (!(await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const m = req.nextUrl.searchParams.get("m");
  if (!isMonth(m)) return NextResponse.json({ error: "m must be YYYY-MM" }, { status: 400 });
  return NextResponse.json(await loadMonth(m), { headers: { "Cache-Control": "private, no-store" } });
}
