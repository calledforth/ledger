import type { VendorIcon } from "@/lib/icons";

export type ChargeRow = {
  id: string;
  vendor: string | null;
  payee_raw: string | null;
  amount: string;
  amount_label: string;
  currency: string;
  date: string; // IST YYYY-MM-DD
  day_label: string;
  time_label: string;
  direction: "debit" | "credit";
  channel: string | null;
  category: string | null;
  notes: string | null;
  is_refunded: boolean;
  is_refund_credit: boolean;
  needs_review: boolean;
  review_reason: string | null;
  subscription: string | null;
  pdf_url: string | null;
  invoice_number: string | null;
  card_last4: string | null;
  icon: VendorIcon | null;
};

export type UpItem = {
  key: string;
  date: string;
  day: string;
  mon: string;
  vendor: string;
  plan: string | null;
  amount_label: string;
  detail: string;
  mandate: boolean;
  subscription_id: string | null;
  icon: VendorIcon | null;
};
export type UpWeek = { label: string; totals: string; items: UpItem[] };

export type SubCard = {
  id: string;
  vendor: string;
  plan: string;
  amount_label: string;
  cycle: string;
  next_charge_date: string | null;
  next_label: string | null;
  ended_at: string | null;
  billing_url: string | null;
  mandate: string | null;
  icon: VendorIcon | null;
};

export type SummaryCardData = {
  currency: string;
  spent: string;
  subscriptions: string;
  one_time: string;
  credits: string;
  refunded: string;
  transfers: string;
  transfers_by_category: { category: string; amount: string }[];
  credits_by_source: { vendor: string; channel: string | null; amount: string }[];
  daily: { day: number; cumulative: string }[];
  top_vendors: { vendor: string; amount: string; count: number; icon: VendorIcon | null }[];
};

export type ExpectedData = { currency: string; total: string; subs: string; other: string };

/** A due shown on a future calendar day. */
export type DueMark = { date: string; vendor: string; icon: VendorIcon | null };

/** Everything the dashboard needs for one month. Plain JSON, so the client can cache and prefetch it. */
export type MonthData = {
  month: string;
  today: string;
  /** Bumped on every server load so the client can tell fresh data from cached data. */
  loaded_at: number;
  note: string | null;
  review_count: number;
  summary: SummaryCardData[];
  expected: ExpectedData[];
  rows: ChargeRow[];
  dues: DueMark[];
  weeks: UpWeek[] | null;
  subs: SubCard[];
};
