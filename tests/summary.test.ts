import { describe, expect, it } from "vitest";
import { addCharge, markRefunded } from "@/domain/charges";
import { getMonthSummary, monthlySpending } from "@/domain/summary";
import { upcomingPayments } from "@/domain/upcoming";
import { upsertSubscription } from "@/domain/subscriptions";
import { addUpcomingEvent } from "@/domain/upcoming";
import { db, msgId } from "./helpers";

describe("month summary", () => {
  it("per-currency totals, refunds and credits excluded, never mixed", async () => {
    await upsertSubscription(db(), { vendor: "Cursor", plan: "Pro", amount: 20, currency: "USD", cycle: "monthly", next_charge_date: "2026-10-07" });
    await addCharge(db(), { amount: 20, currency: "USD", charged_at: "2026-10-07T10:00", source: "hdfc_alert", hdfc_message_id: msgId(), vendor: "Cursor" });
    await addCharge(db(), { amount: "15.50", currency: "USD", charged_at: "2026-10-08T10:00", source: "manual", vendor: "Gumroad" });
    await addCharge(db(), { amount: 486, currency: "INR", charged_at: "2026-10-02T10:00", source: "manual", vendor: "Swiggy" });
    const amazon = await addCharge(db(), { amount: 2399, currency: "INR", charged_at: "2026-10-04T10:00", source: "manual", vendor: "Amazon" });
    await markRefunded(db(), { charge_id: amazon.charge.id, create_refund_credit: true, refund: { charged_at: "2026-10-06T10:00" } });
    await addCharge(db(), { amount: 124500, currency: "INR", charged_at: "2026-10-03T10:00", source: "hdfc_alert", hdfc_message_id: msgId(), direction: "credit", vendor: "Wise", channel: "NEFT" });
    await addCharge(db(), { amount: 300, currency: "USD", charged_at: "2026-10-09T10:00", source: "manual", direction: "credit", vendor: "Upwork" });

    const s = await getMonthSummary(db(), { month: "2026-10" });
    expect(s.spending).toEqual({ INR: "486.00", USD: "35.50" });
    expect(s.credits).toEqual({ INR: "124500.00", USD: "300.00" });
    const usd = s.currencies.find((c) => c.currency === "USD")!;
    expect(usd.subscriptions).toBe("20.00");
    expect(usd.one_time).toBe("15.50");
    const inr = s.currencies.find((c) => c.currency === "INR")!;
    expect(inr.refunded).toBe("2399.00");
    expect(inr.credits_by_source).toEqual([{ vendor: "Wise", channel: "NEFT", amount: "124500.00", count: 1 }]);
    expect(inr.daily[30].cumulative).toBe("486.00");
    expect(s.counts.refunded).toBe(1);
    expect(s.currencies.map((c) => c.currency)).toEqual(["INR", "USD"]);
  });
});

describe("monthly spending", () => {
  it("buckets by IST month with the same exclusions as the month summary", async () => {
    await addCharge(db(), { amount: 100, currency: "INR", charged_at: "2026-08-31T23:30", source: "manual", vendor: "Swiggy" }); // IST, still August
    await addCharge(db(), { amount: 200, currency: "INR", charged_at: "2026-09-01T00:30", source: "manual", vendor: "Swiggy" });
    await addCharge(db(), { amount: 5000, currency: "INR", charged_at: "2026-09-02T10:00", source: "manual", vendor: "HDFC Securities", category: "transfer:investment" });
    const r = await addCharge(db(), { amount: 999, currency: "INR", charged_at: "2026-09-03T10:00", source: "manual", vendor: "Amazon" });
    await markRefunded(db(), { charge_id: r.charge.id });
    await addCharge(db(), { amount: 20, currency: "USD", charged_at: "2026-09-04T10:00", source: "manual", vendor: "Cursor" });
    await addCharge(db(), { amount: 300, currency: "USD", charged_at: "2026-09-05T10:00", source: "manual", direction: "credit", vendor: "Upwork" });

    const m = await monthlySpending(db(), { from: "2026-07", to: "2026-09" });
    expect(m).toEqual([
      { month: "2026-07", spent: {} },
      { month: "2026-08", spent: { INR: "100.00" } },
      { month: "2026-09", spent: { INR: "200.00", USD: "20.00" } },
    ]);
  });
});

describe("upcoming payments", () => {
  it("groups by ISO week with per-currency weekly totals", async () => {
    await upsertSubscription(db(), { vendor: "iCloud", plan: "200GB", amount: 219, currency: "INR", cycle: "monthly", next_charge_date: "2026-10-12" });
    await upsertSubscription(db(), { vendor: "Notion", plan: "Plus", amount: 10, currency: "USD", cycle: "monthly", next_charge_date: "2026-10-14" });
    await upsertSubscription(db(), { vendor: "Ended", plan: "X", amount: 5, currency: "USD", cycle: "monthly", next_charge_date: "2026-10-13", ended_at: "2026-10-12" });
    const airtel = await upsertSubscription(db(), { vendor: "Airtel", plan: "Fiber", amount: 999, currency: "INR", cycle: "monthly", next_charge_date: "2026-10-18" });
    // A mandate notice replaces the projected Airtel charge rather than doubling it.
    await addUpcomingEvent(db(), { vendor: "Airtel", amount: 1049, currency: "INR", expected_date: "2026-10-17", kind: "mandate_upcoming", subscription_id: airtel.subscription.id, source_message_id: "n1" });
    await addUpcomingEvent(db(), { vendor: "Dentist", amount: 1500, currency: "INR", expected_date: "2026-10-16" });
    await upsertSubscription(db(), { vendor: "Netflix", plan: "Standard", amount: 499, currency: "INR", cycle: "monthly", next_charge_date: "2026-10-27" });
    await upsertSubscription(db(), { vendor: "Upwork", plan: "Freelancer Plus", amount: 20, currency: "USD", cycle: "monthly", next_charge_date: "2026-11-01" });

    const res = await upcomingPayments(db(), { from: "2026-10-10", days: 30 });
    expect(res.weeks.map((w) => [w.week, w.week_start, w.totals])).toEqual([
      ["2026-W42", "2026-10-12", { INR: "2768.00", USD: "10.00" }],
      ["2026-W44", "2026-10-26", { INR: "499.00", USD: "20.00" }],
    ]);
    const airtelItems = res.weeks.flatMap((w) => w.items).filter((i) => i.vendor === "Airtel");
    expect(airtelItems).toHaveLength(1);
    expect(airtelItems[0].kind).toBe("mandate_upcoming");
    expect(res.weeks.flatMap((w) => w.items).some((i) => i.vendor === "Ended")).toBe(false);
    expect(res.totals).toEqual({ INR: "3267.00", USD: "30.00" });
  });
});
