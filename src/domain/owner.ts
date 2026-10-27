import type { Db } from "@/db/client";
import { aliasPatternFor, upsertVendorAlias } from "./aliases";
import { getCharge, markRefunded, updateCharge } from "./charges";
import { DomainError } from "./errors";
import { cancelSubscription, setSubscriptionEnd } from "./subscriptions";

/**
 * The edits the owner makes by hand, from the dashboard's row sheet or the mobile app. One place, so the server
 * actions and the JSON routes behave identically.
 */
export type EditChargeInput = {
  id: string;
  vendor?: string | null;
  category?: string | null;
  notes?: string | null;
  /** true clears the review flag. */
  reviewed?: boolean;
  /** Save vendor (and category) as an alias for this charge's raw payee, and apply it to matching rows. */
  save_alias?: boolean;
  refunded?: boolean;
};

export async function editCharge(tx: Db, input: EditChargeInput) {
  const vendor = input.vendor?.trim() ?? undefined;
  const category = input.category?.trim() ?? undefined;
  const patch: Parameters<typeof updateCharge>[1] = { id: input.id };
  if (input.vendor !== undefined) patch.vendor = vendor || null;
  if (input.category !== undefined) patch.category = category || null;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.reviewed) patch.needs_review = false;
  if (Object.keys(patch).length > 1) await updateCharge(tx, patch);
  const charge = await getCharge(tx, input.id);
  if (input.save_alias) {
    const name = vendor || charge.vendor;
    if (!name) throw new DomainError("invalid_input", "Give the vendor a name before saving an alias");
    const pattern = charge.payeeRaw ? aliasPatternFor(charge.payeeRaw) : "";
    if (pattern.length < 2) throw new DomainError("invalid_input", "This charge has no raw payee text to alias");
    await upsertVendorAlias(tx, { raw_pattern: pattern, canonical_vendor: name, category: category || charge.category || null, apply_to_existing: true });
  }
  if (input.refunded) await markRefunded(tx, { charge_id: input.id });
  return getCharge(tx, input.id);
}

export type EditSubscriptionInput = { id: string; action: "cancel"; cancelled_on?: string | null; ended_at?: string | null } | { id: string; action: "set_end"; ended_at: string | null };

export async function editSubscription(tx: Db, input: EditSubscriptionInput) {
  if (input.action === "cancel") return cancelSubscription(tx, { id: input.id, cancelled_on: input.cancelled_on ?? null, ended_at: input.ended_at ?? null });
  return setSubscriptionEnd(tx, { id: input.id, ended_at: input.ended_at });
}
