/**
 * The shape of GET /api/month, as the app uses it. Mirrors app/dashboard/types.ts and src/domain/narrative.ts in the
 * web app; keep the two in step when the API grows.
 */
export type Tone = "plain" | "strong" | "in" | "invest" | "out";
export type Segment = { text: string; tone?: Tone };

export type MonthStory = {
  paragraphs: Segment[][];
  biggest_expense: { id: string; vendor: string; amount: string; currency: string; amount_label: string; date: string; category: string | null; share_pct: number } | null;
  highest_day: { date: string; amount: string; currency: string; amount_label: string } | null;
  projected: { currency: string; amount: string; amount_label: string }[];
  vs_previous: { currency: string; delta_pct: number; direction: "under" | "over" | "same"; label: string } | null;
  by_category: { currency: string; category: string; amount: string; amount_label: string; pct: number }[];
};

export type ChargeRow = {
  id: string;
  vendor: string | null;
  payee_raw: string | null;
  amount: string;
  amount_label: string;
  currency: string;
  date: string;
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
};

export type UpItem = { key: string; date: string; day: string; mon: string; vendor: string; plan: string | null; amount_label: string; detail: string; mandate: boolean; subscription_id: string | null };
export type UpWeek = { label: string; totals: string; items: UpItem[] };

export type SubCard = { id: string; vendor: string; plan: string; amount_label: string; cycle: string; next_charge_date: string | null; next_label: string | null; ended_at: string | null; billing_url: string | null; mandate: string | null };

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
  by_category: { category: string; amount: string }[];
  daily: { day: number; amount: string; cumulative: string }[];
};

export type MonthData = {
  month: string;
  today: string;
  loaded_at: number;
  note: string | null;
  story: MonthStory;
  due_total: string | null;
  subs_monthly: string;
  review_count: number;
  summary: SummaryCardData[];
  expected: { currency: string; total: string; subs: string; other: string }[];
  rows: ChargeRow[];
  weeks: UpWeek[] | null;
  subs: SubCard[];
  history: { month: string; spent: Record<string, string> }[];
};
