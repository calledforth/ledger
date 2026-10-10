/**
 * npm run db:seed                 vendor aliases only (safe to re-run)
 * npm run db:seed -- --demo       also inserts clearly labelled example rows (refused in production without --force)
 * npm run db:seed -- --purge-demo removes every example row
 * npm run db:seed -- --if-empty   seeds aliases only when the table is empty (used on every Vercel deploy)
 */
import "dotenv/config";
import { like, or } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { charges, subscriptions, upcomingEvents, vendorAliases } from "@/db/schema";
import { upsertVendorAlias } from "@/domain/aliases";
import { addCharge, markRefunded } from "@/domain/charges";
import { upsertSubscription } from "@/domain/subscriptions";
import { addUpcomingEvent } from "@/domain/upcoming";
import { addDays, todayIst } from "@/lib/time";

const TAG = "[EXAMPLE DATA]";
const args = new Set(process.argv.slice(2));

const ALIASES: { raw_pattern: string; canonical_vendor: string; category?: string }[] = [
  { raw_pattern: "wise", canonical_vendor: "Wise", category: "income:freelance" },
  { raw_pattern: "upwork", canonical_vendor: "Upwork" },
  { raw_pattern: "anthropic", canonical_vendor: "Anthropic", category: "software" },
  { raw_pattern: "claude.ai", canonical_vendor: "Anthropic", category: "software" },
  { raw_pattern: "cursor", canonical_vendor: "Cursor", category: "software" },
  { raw_pattern: "vercel", canonical_vendor: "Vercel", category: "software" },
  { raw_pattern: "github", canonical_vendor: "GitHub", category: "software" },
  { raw_pattern: "netflix", canonical_vendor: "Netflix", category: "entertainment" },
  { raw_pattern: "spotify", canonical_vendor: "Spotify", category: "entertainment" },
  { raw_pattern: "swiggy", canonical_vendor: "Swiggy", category: "food" },
  { raw_pattern: "zomato", canonical_vendor: "Zomato", category: "food" },
  { raw_pattern: "uber", canonical_vendor: "Uber", category: "transport" },
  { raw_pattern: "amazon", canonical_vendor: "Amazon", category: "shopping" },
  { raw_pattern: "airtel", canonical_vendor: "Airtel", category: "utilities" },
  { raw_pattern: "jio", canonical_vendor: "Jio", category: "utilities" },
  { raw_pattern: "openai", canonical_vendor: "OpenAI", category: "software" },
  { raw_pattern: "mobbin", canonical_vendor: "Mobbin", category: "software" },
  { raw_pattern: "1password", canonical_vendor: "1Password", category: "software" },
  { raw_pattern: "linear", canonical_vendor: "Linear", category: "software" },
  { raw_pattern: "wispr", canonical_vendor: "Wispr", category: "software" },
  { raw_pattern: "twitter", canonical_vendor: "X", category: "software" },
  { raw_pattern: "x corp", canonical_vendor: "X", category: "software" },
  { raw_pattern: "fancode", canonical_vendor: "FanCode", category: "entertainment" },
  // Money moved to your own investment account: listed, but not counted as spending.
  { raw_pattern: "hsl sec", canonical_vendor: "HDFC Securities", category: "transfer:investment" },
];

async function seedAliases() {
  const db = getDb();
  if (args.has("--if-empty")) {
    const [existing] = await db.select({ id: vendorAliases.id }).from(vendorAliases).limit(1);
    if (existing) {
      console.log("Vendor aliases already present; leaving them as they are.");
      return;
    }
  }
  for (const a of ALIASES) await upsertVendorAlias(db, a);
  console.log(`Vendor aliases: ${ALIASES.length} upserted.`);
}

async function purgeDemo() {
  const db = getDb();
  await db.transaction(async (tx) => {
    const c = await tx.delete(charges).where(or(like(charges.notes, `${TAG}%`), like(charges.vendor, "Example %"))).returning({ id: charges.id });
    const u = await tx.delete(upcomingEvents).where(like(upcomingEvents.notes, `${TAG}%`)).returning({ id: upcomingEvents.id });
    const s = await tx.delete(subscriptions).where(like(subscriptions.notes, `${TAG}%`)).returning({ id: subscriptions.id });
    const a = await tx.delete(vendorAliases).where(like(vendorAliases.canonicalVendor, "Example %")).returning({ id: vendorAliases.id });
    console.log(`Removed example data: ${c.length} charges, ${s.length} subscriptions, ${u.length} upcoming events, ${a.length} aliases.`);
  });
}

async function seedDemo() {
  const prod = process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
  if (prod && !args.has("--force")) {
    console.error("Refusing to seed example data in production. Pass --force if you really mean it.");
    process.exit(1);
  }
  const db = getDb();
  const today = todayIst();
  const month = today.slice(0, 7);
  const at = (day: number, time = "10:00") => `${month}-${String(Math.min(day, Number(today.slice(8)))).padStart(2, "0")}T${time}`;
  await db.transaction(async (tx) => {
    const note = (s: string) => `${TAG} ${s}`;
    await upsertSubscription(tx, { vendor: "Example Streaming", plan: "Standard", amount: 499, currency: "INR", cycle: "monthly", next_charge_date: `${month}-01`, notes: note("demo subscription") });
    await upsertSubscription(tx, { vendor: "Example AI", plan: "Pro", amount: 20, currency: "USD", cycle: "monthly", next_charge_date: addDays(today, 6), billing_url: "https://example.com/billing", notes: note("demo subscription") });
    await upsertSubscription(tx, { vendor: "Example Broadband", plan: "Fiber", amount: 999, currency: "INR", cycle: "monthly", next_charge_date: addDays(today, 12), mandate_info: { max_amount: 1500, currency: "INR", bank: "HDFC" }, notes: note("demo mandate") });
    await addUpcomingEvent(tx, { vendor: "Example Dentist", amount: 1500, currency: "INR", expected_date: addDays(today, 3), notes: note("demo expected payment") });
    await addCharge(tx, { amount: 499, currency: "INR", charged_at: at(1, "06:00"), source: "manual", vendor: "Example Streaming", notes: note("subscription charge") });
    await addCharge(tx, { amount: 486, currency: "INR", charged_at: at(2, "13:10"), source: "manual", vendor: "Example Food Delivery", channel: "UPI", category: "food", notes: note("one-time") });
    await addCharge(tx, { amount: 124500, currency: "INR", charged_at: at(3, "18:40"), source: "manual", direction: "credit", vendor: "Example Payout", channel: "NEFT", category: "income:freelance", notes: note("freelance credit") });
    const refunded = await addCharge(tx, { amount: 2399, currency: "INR", charged_at: at(4, "21:15"), source: "manual", vendor: "Example Shop", channel: "card", notes: note("refunded purchase") });
    await markRefunded(tx, { charge_id: refunded.charge.id, create_refund_credit: true, refund: { charged_at: at(6), notes: note("refund credit") } });
    await addCharge(tx, { amount: 1250, currency: "INR", charged_at: at(5, "09:30"), source: "manual", payee_raw: "UPI-EXAMPLEQR-UNKNOWN", channel: "UPI", notes: note("unknown vendor, needs review") });
    await addCharge(tx, { amount: "15.50", currency: "USD", charged_at: at(5, "23:00"), source: "manual", vendor: "Example Tools", channel: "card", notes: note("one-time USD") });
  });
  console.log("Example data inserted (labelled [EXAMPLE DATA]). Remove it with: npm run db:seed -- --purge-demo");
}

try {
  if (args.has("--purge-demo")) await purgeDemo();
  else {
    await seedAliases();
    if (args.has("--demo")) await seedDemo();
  }
} finally {
  await closeDb();
}
