import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import { addCharge } from "@/domain/charges";
import { setMonthNote } from "@/domain/summary";
import { upsertSubscription } from "@/domain/subscriptions";
import { PATCH as patchCharge } from "../app/api/charges/[id]/route";
import { POST as login } from "../app/api/login/route";
import { GET as getMonth } from "../app/api/month/route";
import { PATCH as patchSub } from "../app/api/subscriptions/[id]/route";
import { db, msgId } from "./helpers";

/** The JSON API the mobile app uses, called in-process: token login, bearer auth, the month payload, row edits. */
const json = (method: string, url: string, body?: unknown, token?: string) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

let token = "";

beforeAll(async () => {
  process.env.OWNER_PASSWORD_HASH = await bcrypt.hash("open sesame", 4);
  const res = await login(json("POST", "/api/login", { password: "open sesame" }));
  expect(res.status).toBe(200);
  token = ((await res.json()) as { token: string }).token;
  expect(token).toMatch(/^eyJ/);
});

describe("api", () => {
  it("login rejects a wrong password and /api/month needs a session", async () => {
    expect((await login(json("POST", "/api/login", { password: "nope" }))).status).toBe(401);
    expect((await getMonth(json("GET", "/api/month?m=2026-10"))).status).toBe(401);
    expect((await getMonth(json("GET", "/api/month?m=2026-10", undefined, "not-a-token"))).status).toBe(401);
  });

  it("the month payload carries the story, categories and the assistant's note lines", async () => {
    await addCharge(db(), { amount: 21990, currency: "INR", charged_at: "2026-10-14T12:00", source: "manual", vendor: "Amazon", category: "shopping" });
    await addCharge(db(), { amount: 640, currency: "INR", charged_at: "2026-10-14T13:00", source: "manual", vendor: "Swiggy", category: "food" });
    await addCharge(db(), { amount: 50000, currency: "INR", charged_at: "2026-10-20T10:00", source: "manual", vendor: "HDFC Securities", category: "transfer:investment" });
    await addCharge(db(), { amount: 241500, currency: "INR", charged_at: "2026-10-03T10:00", source: "hdfc_alert", hdfc_message_id: msgId(), direction: "credit", vendor: "Wise", channel: "NEFT" });
    await setMonthNote(db(), { month: "2026-10", note: "  Quiet month.\r\n\r\n One big Amazon order. " });

    const res = await getMonth(json("GET", "/api/month?m=2026-10", undefined, token));
    expect(res.status).toBe(200);
    const m = (await res.json()) as { note: string; story: { paragraphs: { text: string }[][]; biggest_expense: { vendor: string }; highest_day: { date: string } }; summary: { by_category: { category: string }[] }[] };
    expect(m.note).toBe("Quiet month.\nOne big Amazon order.");
    expect(m.story.paragraphs[0].map((s) => s.text).join("")).toBe("You received ₹2,41,500 from Wise over NEFT, and moved ₹50,000 to HDFC Securities. That's money moved, not spent.");
    expect(m.story.biggest_expense.vendor).toBe("Amazon");
    expect(m.story.highest_day.date).toBe("2026-10-14");
    expect(m.summary[0].by_category.map((c) => c.category)).toEqual(["shopping", "food"]);
  });

  it("PATCH /api/charges/:id names a vendor, saves the alias for the payee and marks refunds", async () => {
    const unknown = await addCharge(db(), { amount: 1250, currency: "INR", charged_at: "2026-10-15T20:00", source: "hdfc_alert", hdfc_message_id: msgId(), payee_raw: "PAY*BADMINTON COURT@okicici" });
    expect(unknown.charge.needs_review).toBe(true);

    const bad = await patchCharge(json("PATCH", `/api/charges/${unknown.charge.id}`, { vendor: "x" }), params(unknown.charge.id));
    expect(bad.status).toBe(401);

    const res = await patchCharge(json("PATCH", `/api/charges/${unknown.charge.id}`, { vendor: "Badminton Court", category: "health", reviewed: true, save_alias: true }, token), params(unknown.charge.id));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { charge: { vendor: string; category: string; needsReview: boolean } };
    expect(body.charge).toMatchObject({ vendor: "Badminton Court", category: "health", needsReview: false });

    // The alias now names the next charge from the same payee without review.
    const next = await addCharge(db(), { amount: 1250, currency: "INR", charged_at: "2026-10-22T20:00", source: "hdfc_alert", hdfc_message_id: msgId(), payee_raw: "PAY*BADMINTON COURT@okicici" });
    expect(next.charge).toMatchObject({ vendor: "Badminton Court", category: "health", needs_review: false });

    const refund = await patchCharge(json("PATCH", `/api/charges/${next.charge.id}`, { refunded: true }, token), params(next.charge.id));
    expect(((await refund.json()) as { charge: { isRefunded: boolean } }).charge.isRefunded).toBe(true);

    expect((await patchCharge(json("PATCH", "/api/charges/not-a-uuid", {}, token), params("not-a-uuid"))).status).toBe(400);
    expect((await patchCharge(json("PATCH", `/api/charges/${next.charge.id}`, { reviewed: "yes" }, token), params(next.charge.id))).status).toBe(400);
  });

  it("PATCH /api/subscriptions/:id cancels locally", async () => {
    const sub = await upsertSubscription(db(), { vendor: "Netflix", plan: "Standard", amount: 649, currency: "INR", cycle: "monthly", next_charge_date: "2026-11-24" });
    const res = await patchSub(json("PATCH", `/api/subscriptions/${sub.subscription.id}`, { action: "cancel", cancelled_on: "2026-10-26", ended_at: "2026-11-23" }, token), params(sub.subscription.id));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { subscription: { status: string; subscription: { status: string; ended_at: string | null } } };
    expect(body.subscription.status).toBe("cancelled");
    expect(body.subscription.subscription).toMatchObject({ status: "cancelled", ended_at: "2026-11-23" });
  });
});
