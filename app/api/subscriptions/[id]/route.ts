import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { DomainError } from "@/domain/errors";
import { editSubscription } from "@/domain/owner";
import { isOwnerRequest } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel"), cancelled_on: date.nullish(), ended_at: date.nullish() }),
  z.object({ action: z.literal("set_end"), ended_at: date.nullable() }),
]);

/** Cancel a subscription locally or set its end date. Never contacts the vendor. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isOwnerRequest(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Bad subscription id" }, { status: 400 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad body", details: parsed.error.issues }, { status: 400 });
  try {
    const subscription = await getDb().transaction((tx) => editSubscription(tx, { id, ...parsed.data }));
    return NextResponse.json({ ok: true, subscription }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof DomainError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.code === "not_found" ? 404 : 400 });
    throw e;
  }
}
