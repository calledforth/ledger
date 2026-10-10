import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { count } from "drizzle-orm";
import { charges, subscriptions, upcomingEvents } from "@/db/schema";
import { listCharges } from "@/domain/charges";
import { classifyRow, importCsv } from "@/domain/importCsv";
import { upsertVendorAlias } from "@/domain/aliases";
import { getMonthSummary } from "@/domain/summary";
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

describe("CSV import: alert export format (datetime_ist, event_type)", () => {
  const exportCsv = readFileSync(new URL("./fixtures/alerts-export-sample.csv", import.meta.url), "utf8");
  const exp = { transactions: 7, mandate: 6 };

  it("maps the export columns, mandates, refunds and transfers", async () => {
    for (const a of [
      { raw_pattern: "wise", canonical_vendor: "Wise", category: "income:freelance" },
      { raw_pattern: "airtel", canonical_vendor: "Airtel" },
      { raw_pattern: "hsl sec", canonical_vendor: "HDFC Securities", category: "transfer:investment" },
      { raw_pattern: "exampletool", canonical_vendor: "ExampleTool" },
      { raw_pattern: "othertool", canonical_vendor: "OtherTool" },
      { raw_pattern: "exampleai", canonical_vendor: "ExampleAI" },
    ])
      await upsertVendorAlias(db(), a);
    const r = await importCsv(db(), exportCsv, { expected: exp });
    expect(r.count_warning).toBeUndefined();
    expect(r.rejected).toEqual([]);
    expect(r.refunds_linked).toBe(1);
    expect(r.mandate_events_applied).toEqual({ registered: 3, upcoming: 1, declined: 0, cancelled: 1 });
    expect(r.warnings.map((w) => w.message)).toEqual([expect.stringMatching(/declined auto-debit for "OtherTool"/)]);

    const rows = (await listCharges(db(), { month: "2026-09" })).charges;
    const by = (p: string) => rows.find((c) => c.payee_raw?.includes(p))!;
    // "(email time)" stripped, IST kept.
    expect(by("WISE").charged_at).toBe(new Date("2026-09-01T18:48:00+05:30").toISOString());
    // A bank handle (@rxairtel) never names the vendor; the UPI payee name does.
    expect(by("Example Health").vendor).toBe("Example Health Pvt Ltd");
    // Account last four is not a card number.
    expect(by("Example Health").card_last4).toBeNull();
    expect(by("EXAMPLETOOL").card_last4).toBe("2222");
    expect(by("A FRIEND").category).toBe("people");
    expect(by("HSL Sec").category).toBe("transfer:investment");
    expect(rows.find((c) => c.payee_raw === "OTHERTOOL IDE")!.is_refunded).toBe(true);

    const subs = await db().select().from(subscriptions);
    const tool = subs.find((s) => s.vendor === "ExampleTool")!;
    expect([tool.amount, tool.currency, tool.nextChargeDate]).toEqual(["12.00", "USD", "2026-10-10"]);
    expect(by("EXAMPLETOOL").subscription_id).toBe(tool.id);
    const other = subs.filter((s) => s.vendor === "OtherTool").sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    expect(other.map((s) => [s.mandateInfo?.mandate_ref, s.status])).toEqual([["SI Hub ID CCC", "cancelled"], ["SI Hub ID DDD", "active"]]);
    const ai = subs.find((s) => s.vendor === "ExampleAI")!;
    expect([ai.amount, ai.nextChargeDate]).toEqual(["1999.00", "2026-10-11"]);

    const sep = await getMonthSummary(db(), { month: "2026-09" });
    const inr = sep.currencies[0];
    // Money sent to people counts as spending; the broker transfer does not.
    expect(inr.spent).toBe("2297.00");
    expect(inr.transfers_by_category).toEqual([{ category: "transfer:investment", amount: "5000.00" }]);
  });

  it("re-importing the export changes nothing", async () => {
    await importCsv(db(), exportCsv, { expected: exp });
    const snap = async () => JSON.stringify([await db().select().from(charges).orderBy(charges.id), await db().select().from(subscriptions).orderBy(subscriptions.id), await db().select().from(upcomingEvents).orderBy(upcomingEvents.id)]);
    const before = await snap();
    const r = await importCsv(db(), exportCsv, { expected: exp });
    expect(r.charges.existing).toBe(7);
    expect(await snap()).toBe(before);
  });
});
