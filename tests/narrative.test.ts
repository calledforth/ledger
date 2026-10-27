import { describe, expect, it } from "vitest";
import { monthStory, storyText, transferLabel, type NarrativeInput } from "@/domain/narrative";

const inr = (over: Partial<NarrativeInput["currencies"][number]> = {}): NarrativeInput["currencies"][number] => ({
  currency: "INR",
  spent: "142380.00",
  subscriptions: "22410.00",
  one_time: "119970.00",
  credits: "241500.00",
  transfers: "50000.00",
  transfers_by_category: [{ category: "transfer:investment", amount: "50000.00" }],
  credits_by_source: [{ vendor: "Wise", channel: "NEFT", amount: "241500.00" }],
  by_category: [
    { category: "people", amount: "45000.00" },
    { category: "shopping", amount: "41230.00" },
  ],
  daily: [
    { day: 14, amount: "28450.00" },
    { day: 19, amount: "45000.00" },
  ],
  ...over,
});

const rows: NarrativeInput["rows"] = [
  { id: "a", vendor: "Amazon", amount: "21990.00", currency: "INR", date: "2026-10-14", direction: "debit", category: "shopping", is_refunded: false },
  { id: "b", vendor: "Landlord", amount: "45000.00", currency: "INR", date: "2026-10-19", direction: "debit", category: "people", is_refunded: false },
  { id: "c", vendor: "HDFC Securities", amount: "50000.00", currency: "INR", date: "2026-10-20", direction: "debit", category: "transfer:investment", is_refunded: false },
  { id: "d", vendor: "Apple", amount: "99000.00", currency: "INR", date: "2026-10-02", direction: "debit", category: "shopping", is_refunded: true },
  { id: "e", vendor: "Wise", amount: "241500.00", currency: "INR", date: "2026-10-03", direction: "credit", category: null, is_refunded: false },
];

describe("month story", () => {
  it("says received, moved, subscriptions and the rest, per currency, never mixed", () => {
    const s = monthStory({
      month: "2026-10",
      today: "2026-10-26",
      currencies: [inr(), { ...inr({ currency: "USD", spent: "218.00", subscriptions: "195.00", one_time: "23.00", credits: "0.00", transfers: "0.00", transfers_by_category: [], credits_by_source: [], by_category: [{ category: "software", amount: "218.00" }], daily: [] }) }],
      rows,
      previous: { INR: "188920.00" },
    });
    const text = storyText(s);
    expect(text).toContain("You received ₹2,41,500 from Wise over NEFT, and moved ₹50,000 to HDFC Securities. That's money moved, not spent.");
    expect(text).toContain("Subscriptions account for ₹22,410 and $195 so far.");
    expect(text).toContain("Kept apart: $218 on software.");
    expect(text).toContain("The rest, ₹1,19,970, went to:");
    // Tones mark the numbers so the apps can colour them.
    const tones = s.paragraphs.flat().filter((x) => x.tone).map((x) => [x.text, x.tone]);
    expect(tones).toContainEqual(["₹2,41,500", "in"]);
    expect(tones).toContainEqual(["₹50,000", "invest"]);
  });

  it("biggest expense ignores refunds and transfers; highest day comes from the daily series", () => {
    const s = monthStory({ month: "2026-10", today: "2026-10-26", currencies: [inr()], rows, previous: {} });
    expect(s.biggest_expense).toMatchObject({ id: "b", vendor: "Landlord", amount_label: "₹45,000", date: "2026-10-19", share_pct: 31.6 });
    expect(s.highest_day).toMatchObject({ date: "2026-10-19", amount_label: "₹45,000" });
    expect(s.by_category[0]).toMatchObject({ category: "people", pct: 31.6, amount_label: "₹45,000" });
  });

  it("projects the current month straight-line and compares the projection with last month", () => {
    const s = monthStory({ month: "2026-10", today: "2026-10-26", currencies: [inr()], rows, previous: { INR: "188920.00" } });
    expect(s.projected).toEqual([{ currency: "INR", amount: "169760.76", amount_label: "₹1,69,761" }]);
    expect(s.vs_previous).toMatchObject({ direction: "under", delta_pct: -10.1, label: "10% under last month, at this pace" });
  });

  it("a closed month compares actuals and has no projection; an empty month says so", () => {
    const closed = monthStory({ month: "2026-09", today: "2026-10-26", currencies: [inr()], rows, previous: { INR: "100000.00" } });
    expect(closed.projected).toEqual([]);
    expect(closed.vs_previous).toMatchObject({ direction: "over", label: "42% over last month" });
    expect(storyText(closed)).toContain("Subscriptions account for ₹22,410.");

    expect(storyText(monthStory({ month: "2026-11", today: "2026-10-26", currencies: [], rows: [], previous: {} }))).toBe("Nothing spent yet; this month is in the future.");
    expect(storyText(monthStory({ month: "2026-10", today: "2026-10-26", currencies: [], rows: [], previous: {} }))).toBe("Nothing spent yet this month.");
  });

  it("names the kind of transfer when the money went to several places", () => {
    const s = monthStory({
      month: "2026-09",
      today: "2026-10-26",
      currencies: [inr({ credits: "0.00", credits_by_source: [], transfers_by_category: [{ category: "transfer:investment", amount: "30000.00" }, { category: "transfer:savings", amount: "20000.00" }] })],
      rows: [
        { id: "x", vendor: "HDFC Securities", amount: "30000.00", currency: "INR", date: "2026-09-20", direction: "debit", category: "transfer:investment", is_refunded: false },
        { id: "y", vendor: "SBI", amount: "20000.00", currency: "INR", date: "2026-09-21", direction: "debit", category: "transfer:savings", is_refunded: false },
      ],
      previous: {},
    });
    expect(storyText(s)).toContain("You moved ₹50,000 into investing and savings.");
    expect(transferLabel("transfer:investment")).toBe("investing");
    expect(transferLabel("transfer:gold")).toBe("gold");
  });
});
