"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { DomainError } from "@/domain/errors";
import { editCharge, editSubscription } from "@/domain/owner";
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
    getDb().transaction((tx) =>
      editCharge(tx, {
        id: str(form, "id"),
        vendor: str(form, "vendor"),
        category: str(form, "category"),
        notes: str(form, "notes"),
        reviewed: form.get("reviewed") === "on",
        save_alias: form.get("alias") === "on" && !!str(form, "vendor").trim(),
        refunded: form.get("refunded") === "on",
      }),
    ),
  );
}

export async function cancelSub(form: FormData): Promise<Result> {
  return run(() =>
    getDb().transaction((tx) =>
      editSubscription(tx, { id: str(form, "id"), action: "cancel", cancelled_on: str(form, "cancelled_on") || null, ended_at: str(form, "ended_at") || null }),
    ),
  );
}

export async function setSubEnd(form: FormData): Promise<Result> {
  return run(() => getDb().transaction((tx) => editSubscription(tx, { id: str(form, "id"), action: "set_end", ended_at: str(form, "ended_at") || null })));
}
