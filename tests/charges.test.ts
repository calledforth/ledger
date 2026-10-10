import { describe, expect, it } from "vitest";
import { count } from "drizzle-orm";
import { charges } from "@/db/schema";
import { addCharge, findPossibleDuplicates, listCharges, markRefunded, mergeCharges, updateCharge } from "@/domain/charges";
import { upsertVendorAlias } from "@/domain/aliases";
import { db, msgId } from "./helpers";

const rowCount = async () => (await db().select({ n: count() }).from(charges))[0].n;

describe("add_charge idempotency", () => {
  it("same hdfc_message_id twice gives one row and status existing", async () => {
    const id = msgId();
    const input = { amount: 499, currency: "INR", charged_at: "2026-10-05T10:00", source: "hdfc_alert" as const, hdfc_message_id: id, payee_raw: "NETFLIX", vendor: "Netflix" };
    const a = await addCharge(db(), input);
    const b = await addCharge(db(), input);
    expect(a.status).toBe("created");
    expect(b.status).toBe("existing");
    expect(b.charge.id).toBe(a.charge.id);
    expect(await rowCount()).toBe(1);
  });

  it("a retry fills null columns but never overwrites without overwrite: true", async () => {
    const id = msgId();
    await addCharge(db(), { amount: 100, currency: "INR", charged_at: "2026-10-05T10:00", source: "hdfc_alert", hdfc_message_id: id, vendor: "Swiggy" });
    const r = await addCharge(db(), { amount: 100, currency: "INR", charged_at: "2026-10-05T10:00", source: "hdfc_alert", hdfc_message_id: id, vendor: "Zomato", reference: "UPI123" });
    expect(r.charge.vendor).toBe("Swiggy");
    expect(r.charge.reference).toBe("UPI123");
    expect(r.updated_fields).toEqual(["reference"]);
    const o = await addCharge(db(), { amount: 100, currency: "INR", charged_at: "2026-10-05T10:00", source: "hdfc_alert", hdfc_message_id: id, vendor: "Zomato", overwrite: true });
    expect(o.charge.vendor).toBe("Zomato");
  });
});

describe("HDFC alert + vendor receipt merge", () => {
  it("alert then receipt one day apart becomes one row with both ids", async () => {
    const h = msgId("hdfc");
    const r = msgId("rcpt");
    await addCharge(db(), { amount: "1770.00", currency: "INR", charged_at: "2026-10-03T21:10", source: "hdfc_alert", hdfc_message_id: h, payee_raw: "RAZORPAY*NOTION", channel: "card", card_last4: "4321", reference: "REF9" });
    const res = await addCharge(db(), { amount: "1770", currency: "INR", charged_at: "2026-10-04T09:00", source: "vendor_receipt", receipt_message_id: r, vendor: "Notion", invoice_number: "INV-7" });
    expect(res.status).toBe("merged");
    expect(await rowCount()).toBe(1);
    expect(res.charge.hdfc_message_id).toBe(h);
    expect(res.charge.receipt_message_id).toBe(r);
    expect(res.charge.vendor).toBe("Notion");
    expect(res.charge.invoice_number).toBe("INV-7");
    expect(res.charge.channel).toBe("card");
    expect(res.charge.card_last4).toBe("4321");
    expect(res.charge.source).toBe("hdfc_alert");
    expect(res.charge.charged_at).toBe(new Date("2026-10-03T21:10:00+05:30").toISOString());
    expect(res.charge.needs_review).toBe(false);
  });

  it("receipt then alert also merges, and bank-side fields come from the alert", async () => {
    const h = msgId("hdfc");
    const r = msgId("rcpt");
    await addCharge(db(), { amount: 20, currency: "USD", charged_at: "2026-10-07T12:00", source: "vendor_receipt", receipt_message_id: r, vendor: "Cursor", invoice_number: "C-1" });
    const res = await addCharge(db(), { amount: 20, currency: "USD", charged_at: "2026-10-06T23:50", source: "hdfc_alert", hdfc_message_id: h, payee_raw: "CURSOR AI", channel: "card", card_last4: "9999" });
    expect(res.status).toBe("merged");
    expect(await rowCount()).toBe(1);
    expect(res.charge.vendor).toBe("Cursor");
    expect(res.charge.payee_raw).toBe("CURSOR AI");
    expect(res.charge.charged_at).toBe(new Date("2026-10-06T23:50:00+05:30").toISOString());
    expect(res.charge.source).toBe("vendor_receipt");
  });

  it("tolerates a small rounding difference on receipts", async () => {
    await addCharge(db(), { amount: "1179.60", currency: "INR", charged_at: "2026-10-01T10:00", source: "hdfc_alert", hdfc_message_id: msgId(), vendor: "Jio" });
    const res = await addCharge(db(), { amount: "1180.00", currency: "INR", charged_at: "2026-10-01T10:05", source: "vendor_receipt", receipt_message_id: msgId("r"), vendor: "Jio" });
    expect(res.status).toBe("merged");
    expect(res.charge.amount).toBe("1179.60");
  });

  it("does not merge across currencies or outside two days", async () => {
    await addCharge(db(), { amount: 20, currency: "USD", charged_at: "2026-10-01T10:00", source: "hdfc_alert", hdfc_message_id: msgId(), vendor: "Vercel" });
    const a = await addCharge(db(), { amount: 20, currency: "INR", charged_at: "2026-10-01T10:00", source: "vendor_receipt", receipt_message_id: msgId("r"), vendor: "Vercel" });
    const b = await addCharge(db(), { amount: 20, currency: "USD", charged_at: "2026-10-04T10:01", source: "vendor_receipt", receipt_message_id: msgId("r"), vendor: "Vercel" });
    expect(a.status).toBe("created");
    expect(b.status).toBe("created");
  });

  it("two possible matches: no auto-merge, needs_review and candidates returned", async () => {
    await addCharge(db(), { amount: 500, currency: "INR", charged_at: "2026-10-02T10:00", source: "hdfc_alert", hdfc_message_id: msgId(), payee_raw: "AMAZON PAY" });
    await addCharge(db(), { amount: 500, currency: "INR", charged_at: "2026-10-03T10:00", source: "hdfc_alert", hdfc_message_id: msgId(), payee_raw: "AMAZON PAY" });
    const res = await addCharge(db(), { amount: 500, currency: "INR", charged_at: "2026-10-02T18:00", source: "vendor_receipt", receipt_message_id: msgId("r"), vendor: "Amazon" });
    expect(res.status).toBe("created_needs_review");
    expect(res.charge.needs_review).toBe(true);
    expect(res.charge.review_reason).toBe("possible_duplicate");
    expect(res.candidates).toHaveLength(2);
    expect(await rowCount()).toBe(3);

    // The assistant resolves it with merge_charges; calling it twice is safe.
    const keep = res.candidates![0].id;
    const m1 = await mergeCharges(db(), { keep_id: keep, merge_id: res.charge.id });
    expect(m1.status).toBe("merged");
    expect(m1.charge.receipt_message_id).toBe(res.charge.receipt_message_id);
    expect(m1.charge.vendor).toBe("Amazon");
    expect(m1.charge.needs_review).toBe(false);
    const m2 = await mergeCharges(db(), { keep_id: keep, merge_id: res.charge.id });
    expect(m2.status).toBe("already_merged");
    expect(await rowCount()).toBe(2);
  });

  it("refuses to merge two different bank alerts", async () => {
    const a = await addCharge(db(), { amount: 50, currency: "INR", charged_at: "2026-10-02T10:00", source: "hdfc_alert", hdfc_message_id: msgId(), vendor: "Uber" });
    const b = await addCharge(db(), { amount: 50, currency: "INR", charged_at: "2026-10-02T11:00", source: "hdfc_alert", hdfc_message_id: msgId(), vendor: "Uber" });
    await expect(mergeCharges(db(), { keep_id: a.charge.id, merge_id: b.charge.id })).rejects.toThrow(/two separate bank payments/);
  });
});

describe("vendors, review and sanitising", () => {
  it("unknown vendor gets needs_review; an alias with apply_to_existing resolves it", async () => {
    const res = await addCharge(db(), { amount: 1250, currency: "INR", charged_at: "2026-10-06T10:00", source: "hdfc_alert", hdfc_message_id: msgId(), payee_raw: "UPI-PAYTMQR-COFFEE-ROASTERS" });
    expect(res.status).toBe("created_needs_review");
    expect(res.charge.review_reason).toBe("unknown_vendor");
    const alias = await upsertVendorAlias(db(), { raw_pattern: "coffee-roasters", canonical_vendor: "Blue Tokai", category: "food", apply_to_existing: true });
    expect(alias.applied_count).toBe(1);
    expect(alias.applied[0].vendor).toBe("Blue Tokai");
    expect(alias.applied[0].needs_review).toBe(false);
    // New rows now resolve directly.
    const next = await addCharge(db(), { amount: 300, currency: "INR", charged_at: "2026-10-07T10:00", source: "hdfc_alert", hdfc_message_id: msgId(), payee_raw: "upi-paytmqr-coffee-roasters" });
    expect(next.status).toBe("created");
    expect(next.charge.category).toBe("food");
  });

  it("longest alias pattern wins", async () => {
    await upsertVendorAlias(db(), { raw_pattern: "google", canonical_vendor: "Google" });
    await upsertVendorAlias(db(), { raw_pattern: "google one", canonical_vendor: "Google One", category: "storage" });
    const res = await addCharge(db(), { amount: 130, currency: "INR", charged_at: "2026-10-06T10:00", source: "hdfc_alert", hdfc_message_id: msgId(), payee_raw: "GOOGLE ONE PLAY" });
    expect(res.charge.vendor).toBe("Google One");
  });

  it("masks long digit runs and keeps only card_last4", async () => {
    const res = await addCharge(db(), { amount: 10, currency: "INR", charged_at: "2026-10-06T10:00", source: "manual", vendor: "Bank", payee_raw: "NEFT A/c 5010 0123 4567 89 to X", notes: "card 4111111111111111", card_last4: "4111111111111111" });
    expect(res.charge.payee_raw).toBe("NEFT A/c XXXX6789 to X");
    expect(res.charge.notes).toBe("card XXXX1111");
    expect(res.charge.card_last4).toBe("1111");
    expect(res.warnings?.[0]).toMatch(/last 4/);
  });

  it("update_charge edits vendor/category/notes and resolves review", async () => {
    const res = await addCharge(db(), { amount: 99, currency: "INR", charged_at: "2026-10-06T10:00", source: "manual" });
    expect(res.charge.needs_review).toBe(true);
    const u = await updateCharge(db(), { id: res.charge.id, vendor: "Chai Point", category: "food", notes: "office chai" });
    expect(u.charge.needs_review).toBe(false);
    expect(u.charge.category).toBe("food");
  });
});

describe("listing and refunds", () => {
  it("IST month boundary: 2026-09-30 23:30 IST is September", async () => {
    await addCharge(db(), { amount: 10, currency: "INR", charged_at: "2026-09-30T23:30:00", source: "manual", vendor: "Late" });
    await addCharge(db(), { amount: 10, currency: "INR", charged_at: "2026-10-01T00:15:00+05:30", source: "manual", vendor: "Early" });
    const sep = await listCharges(db(), { month: "2026-09" });
    const oct = await listCharges(db(), { month: "2026-10" });
    expect(sep.charges.map((c) => c.vendor)).toEqual(["Late"]);
    expect(oct.charges.map((c) => c.vendor)).toEqual(["Early"]);
  });

  it("paginates with a cursor", async () => {
    for (let i = 1; i <= 5; i++) await addCharge(db(), { amount: i, currency: "INR", charged_at: `2026-10-0${i}T10:00`, source: "manual", vendor: `V${i}` });
    const p1 = await listCharges(db(), { month: "2026-10", limit: 2 });
    const p2 = await listCharges(db(), { month: "2026-10", limit: 2, cursor: p1.next_cursor! });
    const p3 = await listCharges(db(), { month: "2026-10", limit: 2, cursor: p2.next_cursor! });
    expect([...p1.charges, ...p2.charges, ...p3.charges].map((c) => c.vendor)).toEqual(["V5", "V4", "V3", "V2", "V1"]);
    expect(p3.next_cursor).toBeNull();
  });

  it("mark_refunded creates and links the credit once", async () => {
    const c = await addCharge(db(), { amount: 2399, currency: "INR", charged_at: "2026-10-04T10:00", source: "hdfc_alert", hdfc_message_id: msgId(), vendor: "Amazon" });
    const r1 = await markRefunded(db(), { charge_id: c.charge.id, create_refund_credit: true, refund: { hdfc_message_id: msgId(), charged_at: "2026-10-08T10:00" } });
    const r2 = await markRefunded(db(), { charge_id: c.charge.id, create_refund_credit: true });
    expect(r1.status).toBe("refunded");
    expect(r1.refund_credit?.refund_of_charge_id).toBe(c.charge.id);
    expect(r2.status).toBe("already_refunded");
    expect(r2.refund_credit?.id).toBe(r1.refund_credit?.id);
    expect(await rowCount()).toBe(2);
  });

  it("find_possible_duplicates groups manual + alert lookalikes", async () => {
    await addCharge(db(), { amount: 777, currency: "INR", charged_at: "2026-10-04T10:00", source: "manual", vendor: "Decathlon" });
    await addCharge(db(), { amount: 777, currency: "INR", charged_at: "2026-10-04T12:00", source: "manual", vendor: "Decathlon" });
    await addCharge(db(), { amount: 5, currency: "INR", charged_at: "2026-10-04T12:00", source: "manual", vendor: "Other" });
    const res = await findPossibleDuplicates(db(), { month: "2026-10" });
    expect(res.groups).toHaveLength(1);
    expect(res.groups[0].charges).toHaveLength(2);
  });
});
