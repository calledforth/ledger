import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { DomainError } from "@/domain/errors";
import { editCharge } from "@/domain/owner";
import { isOwnerRequest } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const Body = z.object({
  vendor: z.string().max(200).nullish(),
  category: z.string().max(100).nullish(),
  notes: z.string().max(2000).nullish(),
  reviewed: z.boolean().optional(),
  save_alias: z.boolean().optional(),
  refunded: z.boolean().optional(),
});

/** Edit one charge the way the dashboard's row sheet does: vendor, category, notes, resolve review, alias, refund. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isOwnerRequest(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Bad charge id" }, { status: 400 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad body", details: parsed.error.issues }, { status: 400 });
  try {
    const charge = await getDb().transaction((tx) => editCharge(tx, { id, ...parsed.data }));
    return NextResponse.json({ ok: true, charge }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof DomainError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.code === "not_found" ? 404 : 400 });
    throw e;
  }
}
