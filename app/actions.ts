"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { upsertVendorAlias } from "@/domain/aliases";
import { getCharge, markRefunded, updateCharge } from "@/domain/charges";
import { DomainError } from "@/domain/errors";
import { cancelSubscription, setSubscriptionEnd } from "@/domain/subscriptions";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

type Result = { ok: true } | { ok: false; error: string };

async function guard() {
  if (!(await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value))) throw new Error("Not signed in");
}

async function run(fn: () => Promise<unknown>): Promise<Result> {
  try {
    await guard();
    await fn();
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof DomainError || e instanceof Error ? e.message : "Something went wrong" };
  }
}

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v : "";
};

export async function saveCharge(form: FormData): Promise<Result> {
  return run(() =>
    getDb().transaction(async (tx) => {
      const id = str(form, "id");
      const vendor = str(form, "vendor").trim();
      const category = str(form, "category").trim();
      await updateCharge(tx, {
        id,
        vendor: vendor || null,
        category: category || null,
        notes: str(form, "notes"),
        ...(form.get("reviewed") === "on" ? { needs_review: false } : {}),
      });
      if (form.get("alias") === "on" && vendor) {
        const charge = await getCharge(tx, id);
        if (charge.payeeRaw) await upsertVendorAlias(tx, { raw_pattern: charge.payeeRaw, canonical_vendor: vendor, category: category || null, apply_to_existing: true });
      }
      if (form.get("refunded") === "on") await markRefunded(tx, { charge_id: id });
    }),
  );
}

export async function cancelSub(form: FormData): Promise<Result> {
  return run(() =>
    getDb().transaction((tx) =>
      cancelSubscription(tx, { id: str(form, "id"), cancelled_on: str(form, "cancelled_on") || null, ended_at: str(form, "ended_at") || null }),
    ),
  );
}

export async function setSubEnd(form: FormData): Promise<Result> {
  return run(() => getDb().transaction((tx) => setSubscriptionEnd(tx, { id: str(form, "id"), ended_at: str(form, "ended_at") || null })));
}
