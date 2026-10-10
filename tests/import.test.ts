import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { count } from "drizzle-orm";
import { charges, subscriptions, upcomingEvents } from "@/db/schema";
import { listCharges } from "@/domain/charges";
import { classifyRow, importCsv } from "@/domain/importCsv";
import { upsertVendorAlias } from "@/domain/aliases";
import { db } from "./helpers";

const csv = readFileSync(new URL("./fixtures/backfill-sample.csv", import.meta.url), "utf8");
const expected = { transactions: 7, mandate: 5 };
const n = async (t: typeof charges | typeof subscriptions | typeof upcomingEvents) => (await db().select({ n: count() }).from(t))[0].n;

describe("CSV import", () => {
  it("imports transactions, applies mandate events without creating charges, and reports", async () => {
    await upsertVendorAlias(db(), { raw_pattern: "wise", canonical_vendor: "Wise", category: "income:freelance" });
    await upsertVendorAlias(db(), { raw_pattern: "airtel", canonical_vendor: "Airtel" });
    const r = await importCsv(db(), csv, { expected });
    expect(r.rows_read).toBe(13);
    expect(r.transaction_rows).toBe(7);
    expect(r.mandate_rows).toBe(5);
    expect(r.count_warning).toBeUndefined();
    expect(r.rejected).toEqual([{ line: 14, reason: 'unknown direction "refund" (expected debit, credit or a mandate event)' }]);
    expect(r.charges.created + r.charges.created_needs_review).toBe(7);
    expect(r.credits).toBe(1);
    expect(r.mandate_events_applied).toEqual({ registered: 1, upcoming: 2, declined: 1, cancelled: 1 });
    // The CSV-flagged row plus four payees with no alias yet (Swiggy, Anthropic, Amazon, Chai Point).
    expect(r.flagged_for_review).toBe(5);
    expect(await n(charges)).toBe(7);

    // card_last4 sanitised and amounts with commas parsed.
    const sep = await listCharges(db(), { month: "2026-09" });
    const anthropic = sep.charges.find((c) => c.payee_raw === "ANTHROPIC")!;
    expect(anthropic.card_last4).toBe("4242");
    expect(r.warnings.some((w) => /last 4/.test(w.message))).toBe(true);
    const amazon = sep.charges.find((c) => c.payee_raw === "AMAZON PAY INDIA")!;
    expect(amazon.amount).toBe("2399.00");
    expect(amazon.channel).toBe("card");
    expect(amazon.charged_at).toBe(new Date("2026-09-20T21:15:00+05:30").toISOString());
    // 23:30 IST on the 30th stays in September.
    expect(sep.charges.some((c) => c.payee_raw === "CHAI POINT")).toBe(true);
    const wise = sep.charges.find((c) => c.direction === "credit")!;
    expect(wise.vendor).toBe("Wise");
    expect(wise.category).toBe("income:freelance");
    const flagged = sep.charges.find((c) => c.payee_raw === "UPI-PAYTMQR-XYZ")!;
    expect(flagged.needs_review).toBe(true);

    // The Airtel mandate became a subscription; the Sept debit linked to it; it was later cancelled.
    const [airtel] = await db().select().from(subscriptions);
    expect(airtel.vendor).toBe("Airtel");
    expect(airtel.mandateInfo?.max_amount).toBe("1500.00");
    expect(airtel.mandateInfo?.events?.map((e) => e.type)).toEqual(["registered", "upcoming", "upcoming", "declined", "cancelled"]);
    expect(airtel.status).toBe("cancelled");
    expect(airtel.endedAt).toBe("2026-10-05");
    expect(sep.charges.find((c) => c.payee_raw === "AIRTEL BROADBAND")!.subscription_id).toBe(airtel.id);
    const events = await db().select().from(upcomingEvents);
    expect(events.map((e) => [e.expectedDate, e.status]).sort()).toEqual([["2026-09-07", "paid"], ["2026-10-07", "declined"]]);
  });

  it("re-import is a no-op", async () => {
    await importCsv(db(), csv, { expected });
    const before = [await n(charges), await n(subscriptions), await n(upcomingEvents)];
    const r = await importCsv(db(), csv, { expected });
    expect([await n(charges), await n(subscriptions), await n(upcomingEvents)]).toEqual(before);
    expect(r.charges.existing).toBe(7);
    expect(r.charges.created).toBe(0);
    expect(r.mandate_events_skipped_existing).toBe(5);
  });

  it("dry run writes nothing but still reports", async () => {
    const r = await importCsv(db(), csv, { dry_run: true, expected });
    expect(r.dry_run).toBe(true);
    expect(r.charges.created + r.charges.created_needs_review).toBe(7);
    expect(await n(charges)).toBe(0);
    expect(await n(subscriptions)).toBe(0);
  });

  it("warns (but does not fail) when counts differ from the expected 52 + 11", async () => {
    const r = await importCsv(db(), csv);
    expect(r.count_warning).toMatch(/Expected 52 transaction rows and 11 mandate rows, found 7 and 5/);
  });

  it("classifies mandate rows tolerantly", () => {
    expect(classifyRow("mandate_registered", "")).toEqual({ kind: "mandate", type: "registered" });
    expect(classifyRow("Mandate-Cancelled", "")).toEqual({ kind: "mandate", type: "cancelled" });
    expect(classifyRow("", "Standing instruction declined")).toEqual({ kind: "mandate", type: "declined" });
    expect(classifyRow("debit", "paid via e-mandate")).toEqual({ kind: "debit" });
    expect(classifyRow("debit", "mandate_upcoming for 12 Oct")).toEqual({ kind: "mandate", type: "upcoming" });
    expect(classifyRow("CR", "")).toEqual({ kind: "credit" });
  });
});
