import { describe, expect, it, vi } from "vitest";
import { addCharge } from "@/domain/charges";
import { cancelSubscription, listSubscriptions, upsertSubscription } from "@/domain/subscriptions";
import { db, msgId } from "./helpers";

describe("subscriptions", () => {
  it("plan change Pro $20 -> Max $100 closes the old row and opens a new one", async () => {
    const pro = await upsertSubscription(db(), { vendor: "Anthropic", plan: "Pro", amount: 20, currency: "USD", cycle: "monthly", next_charge_date: "2026-09-10", started_at: "2026-06-10", billing_url: "https://claude.ai/settings/billing" });
    expect(pro.status).toBe("created");
    const max = await upsertSubscription(db(), { vendor: "anthropic", plan: "Max", amount: 100, currency: "USD", cycle: "monthly", next_charge_date: "2026-10-10", started_at: "2026-09-10" });
    expect(max.status).toBe("plan_changed");
    if (max.status !== "plan_changed") throw new Error();
    expect(max.closed.status).toBe("cancelled");
    expect(max.closed.ended_at).toBe("2026-09-10");
    expect(max.subscription.status).toBe("active");
    expect(max.subscription.amount).toBe("100.00");
    expect(max.subscription.billing_url).toBe("https://claude.ai/settings/billing");
    const all = await listSubscriptions(db(), { vendor: "Anthropic" });
    expect(all.subscriptions.map((s) => [s.plan, s.status])).toEqual([["Pro", "cancelled"], ["Max", "active"]]);
  });

  it("same terms update in place instead of opening a new row", async () => {
    await upsertSubscription(db(), { vendor: "Netflix", plan: "Standard", amount: 499, currency: "INR", cycle: "monthly", next_charge_date: "2026-10-05" });
    const again = await upsertSubscription(db(), { vendor: "Netflix", plan: "Standard", amount: "499.00", currency: "INR", cycle: "monthly", next_charge_date: "2026-11-05" });
    expect(again.status).toBe("updated");
    expect(again.subscription.next_charge_date).toBe("2026-11-05");
    expect((await listSubscriptions(db())).subscriptions).toHaveLength(1);
  });

  it("cancel_subscription changes status locally and makes no network call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const s = await upsertSubscription(db(), { vendor: "Notion", plan: "Plus", amount: 10, currency: "USD", cycle: "monthly", next_charge_date: "2026-10-15", billing_url: "https://www.notion.so/settings" });
    const res = await cancelSubscription(db(), { id: s.subscription.id, cancelled_on: "2026-10-10", ended_at: "2026-10-14" });
    expect(res.status).toBe("cancelled");
    expect(res.subscription.status).toBe("cancelled");
    expect(res.subscription.cancelled_on).toBe("2026-10-10");
    expect(res.subscription.ended_at).toBe("2026-10-14");
    expect(res.billing_url).toBe("https://www.notion.so/settings");
    expect(res.message).toMatch(/NOT contacted/);
    expect(fetchSpy).not.toHaveBeenCalled();
    const again = await cancelSubscription(db(), { id: s.subscription.id, cancelled_on: "2026-10-10", ended_at: "2026-10-14" });
    expect(again.status).toBe("already_cancelled");
    fetchSpy.mockRestore();
  });

  it("a matching debit links to the subscription and advances next_charge_date", async () => {
    const s = await upsertSubscription(db(), { vendor: "Spotify", plan: "Individual", amount: 119, currency: "INR", cycle: "monthly", next_charge_date: "2026-10-08" });
    const c = await addCharge(db(), { amount: 119, currency: "INR", charged_at: "2026-10-09T06:00", source: "hdfc_alert", hdfc_message_id: msgId(), vendor: "Spotify" });
    expect(c.linked_subscription_id).toBe(s.subscription.id);
    expect(c.charge.subscription_id).toBe(s.subscription.id);
    const after = await listSubscriptions(db(), { vendor: "Spotify" });
    expect(after.subscriptions[0].next_charge_date).toBe("2026-11-08");
  });

  it("a debit within the mandate max links; one-off subscriptions close after their charge", async () => {
    await upsertSubscription(db(), { vendor: "Airtel", plan: "Fiber", amount: 999, currency: "INR", cycle: "monthly", next_charge_date: "2026-10-07", mandate_info: { max_amount: 1500, currency: "INR" } });
    const c = await addCharge(db(), { amount: 1180, currency: "INR", charged_at: "2026-10-06T06:00", source: "hdfc_alert", hdfc_message_id: msgId(), vendor: "Airtel" });
    expect(c.linked_subscription_id).toBeDefined();
    const once = await upsertSubscription(db(), { vendor: "Conf", plan: "Ticket", amount: 3000, currency: "INR", cycle: "one-off", next_charge_date: "2026-10-12" });
    await addCharge(db(), { amount: 3000, currency: "INR", charged_at: "2026-10-12T06:00", source: "manual", vendor: "Conf" });
    const after = await listSubscriptions(db(), { vendor: "Conf" });
    expect(after.subscriptions[0].id).toBe(once.subscription.id);
    expect(after.subscriptions[0].status).toBe("cancelled");
  });
});
