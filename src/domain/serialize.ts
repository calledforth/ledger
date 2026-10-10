import type { Charge, Subscription, UpcomingEvent, VendorAlias } from "@/db/schema";

/** Public JSON shape of a charge (snake_case to match the schema and tool inputs). */
export function chargeJson(c: Charge) {
  return {
    id: c.id,
    vendor: c.vendor,
    amount: c.amount,
    currency: c.currency,
    charged_at: c.chargedAt.toISOString(),
    source: c.source,
    direction: c.direction,
    hdfc_message_id: c.hdfcMessageId,
    receipt_message_id: c.receiptMessageId,
    invoice_number: c.invoiceNumber,
    pdf_url: c.pdfUrl,
    channel: c.channel,
    payee_raw: c.payeeRaw,
    card_last4: c.cardLast4,
    reference: c.reference,
    category: c.category,
    is_refunded: c.isRefunded,
    refund_of_charge_id: c.refundOfChargeId,
    subscription_id: c.subscriptionId,
    needs_review: c.needsReview,
    review_reason: c.reviewReason,
    notes: c.notes,
    merged_from: c.mergedFrom ?? undefined,
  };
}

export function subscriptionJson(s: Subscription) {
  return {
    id: s.id,
    vendor: s.vendor,
    plan: s.plan,
    amount: s.amount,
    currency: s.currency,
    cycle: s.cycle,
    next_charge_date: s.nextChargeDate,
    billing_url: s.billingUrl,
    status: s.status,
    started_at: s.startedAt,
    ended_at: s.endedAt,
    cancelled_on: s.cancelledOn,
    mandate_info: s.mandateInfo,
    notes: s.notes,
  };
}

export function upcomingEventJson(e: UpcomingEvent) {
  return {
    id: e.id,
    subscription_id: e.subscriptionId,
    vendor: e.vendor,
    amount: e.amount,
    currency: e.currency,
    expected_date: e.expectedDate,
    kind: e.kind,
    source_message_id: e.sourceMessageId,
    status: e.status,
    notes: e.notes,
  };
}

export function aliasJson(a: VendorAlias) {
  return { id: a.id, raw_pattern: a.rawPattern, canonical_vendor: a.canonicalVendor, category: a.category };
}
