/**
 * Sample ledger data for mocks. Inspired by the real domain model
 * (per-currency totals, transfer:* excluded from spend, IST months, agent notes)
 * but fictional. No FX conversion — INR and USD never mix.
 */

export const CATEGORIES = {
  shopping: { label: "Shopping", color: "#E8A54B" },
  food: { label: "Food", color: "#E25A3C" },
  software: { label: "Software", color: "#5B6CFF" },
  entertainment: { label: "Entertainment", color: "#8B7CF7" },
  charity: { label: "Charity", color: "#2FAE7B" },
  people: { label: "People", color: "#D46A9B" },
  utilities: { label: "Utilities", color: "#3BA3C7" },
  transport: { label: "Transport", color: "#7A8494" },
  "transfer:investment": { label: "Investments", color: "#C9A24A" },
  "income:freelance": { label: "Freelance", color: "#1F9D6A" },
};

export const CURRENT_MONTH = "2026-10";

export const MONTHS = [
  {
    id: "2026-07",
    label: "July 2026",
    short: "Jul",
    note: "A steady software month. Food stayed under ₹8,000. Nothing loud.",
    inr: {
      spent: 26840,
      subscriptions: 1767,
      oneTime: 25073,
      credits: 186000,
      transfers: 80000,
      refunded: 0,
      byCategory: [
        { id: "food", amount: 8120 },
        { id: "charity", amount: 5000 },
        { id: "people", amount: 4000 },
        { id: "utilities", amount: 1598 },
        { id: "entertainment", amount: 1067 },
        { id: "transport", amount: 3055 },
        { id: "shopping", amount: 4000 },
      ],
    },
    usd: {
      spent: 84,
      subscriptions: 67,
      oneTime: 17,
      credits: 0,
      transfers: 0,
      refunded: 0,
      byCategory: [{ id: "software", amount: 84 }],
    },
    charges: [],
    empty: false,
  },
  {
    id: "2026-08",
    label: "August 2026",
    short: "Aug",
    note: "Travel weeks. Uber and food ran hotter than usual; subscriptions unchanged.",
    inr: {
      spent: 34120,
      subscriptions: 1767,
      oneTime: 32353,
      credits: 0,
      transfers: 50000,
      refunded: 899,
      byCategory: [
        { id: "food", amount: 12440 },
        { id: "transport", amount: 8920 },
        { id: "people", amount: 6000 },
        { id: "charity", amount: 3000 },
        { id: "utilities", amount: 1598 },
        { id: "entertainment", amount: 1067 },
        { id: "shopping", amount: 1095 },
      ],
    },
    usd: {
      spent: 104,
      subscriptions: 67,
      oneTime: 37,
      credits: 0,
      transfers: 0,
      refunded: 0,
      byCategory: [{ id: "software", amount: 104 }],
    },
    charges: [],
    empty: false,
  },
  {
    id: "2026-09",
    label: "September 2026",
    short: "Sep",
    note: "A quiet month. Food was the only thing that really moved. ₹80,000 went into the gold ETF and is not counted as spend.",
    inr: {
      spent: 22410,
      subscriptions: 1767,
      oneTime: 20643,
      credits: 245000,
      transfers: 80000,
      refunded: 0,
      byCategory: [
        { id: "food", amount: 9180 },
        { id: "charity", amount: 5000 },
        { id: "people", amount: 3000 },
        { id: "utilities", amount: 1598 },
        { id: "entertainment", amount: 1067 },
        { id: "transport", amount: 2565 },
      ],
    },
    usd: {
      spent: 87,
      subscriptions: 67,
      oneTime: 20,
      credits: 0,
      transfers: 0,
      refunded: 0,
      byCategory: [{ id: "software", amount: 87 }],
    },
    charges: [
      { date: "2026-09-02", vendor: "Swiggy", amount: 540, currency: "INR", category: "food", channel: "UPI" },
      { date: "2026-09-04", vendor: "Netflix", amount: 649, currency: "INR", category: "entertainment", channel: "card", subscription: true },
      { date: "2026-09-08", vendor: "Wise", amount: 245000, currency: "INR", category: "income:freelance", channel: "NEFT", direction: "credit" },
      { date: "2026-09-11", vendor: "HDFC Securities", amount: 80000, currency: "INR", category: "transfer:investment", channel: "NEFT", transfer: true },
      { date: "2026-09-14", vendor: "Zomato", amount: 680, currency: "INR", category: "food", channel: "UPI" },
      { date: "2026-09-18", vendor: "GiveIndia", amount: 5000, currency: "INR", category: "charity", channel: "UPI" },
      { date: "2026-09-22", vendor: "Cursor", amount: 20, currency: "USD", category: "software", channel: "card", subscription: true },
    ],
    empty: false,
  },
  {
    id: "2026-10",
    label: "October 2026",
    short: "Oct",
    note: "You spent ₹1,49,540 this month. Highest spend day was 3 Oct — the Pixel at Croma. ₹2,40,000 moved into gold (ETF + coin) and is not counted as spend. Without the phone, October looks like September.",
    highlight: { date: "2026-10-03", vendor: "Croma", label: "Highest spend day", amount: 125819, currency: "INR" },
    inr: {
      spent: 149540,
      subscriptions: 1767,
      oneTime: 147773,
      credits: 412500,
      transfers: 240000,
      refunded: 0,
      byCategory: [
        { id: "shopping", amount: 124999 },
        { id: "charity", amount: 11000 },
        { id: "food", amount: 4006 },
        { id: "people", amount: 5000 },
        { id: "utilities", amount: 1598 },
        { id: "entertainment", amount: 1067 },
        { id: "transport", amount: 620 },
      ],
    },
    usd: {
      spent: 105,
      subscriptions: 67,
      oneTime: 38,
      credits: 0,
      transfers: 0,
      refunded: 0,
      byCategory: [{ id: "software", amount: 105 }],
    },
    charges: [
      { date: "2026-10-01", time: "6:12", vendor: "Netflix", amount: 649, currency: "INR", category: "entertainment", channel: "card", subscription: true },
      { date: "2026-10-01", time: "8:40", vendor: "Airtel", amount: 999, currency: "INR", category: "utilities", channel: "auto-debit", subscription: true },
      { date: "2026-10-02", time: "13:10", vendor: "Swiggy", amount: 486, currency: "INR", category: "food", channel: "UPI" },
      { date: "2026-10-02", time: "23:04", vendor: "Cursor", amount: 20, currency: "USD", category: "software", channel: "card", subscription: true },
      { date: "2026-10-03", time: "11:22", vendor: "Croma", amount: 124999, currency: "INR", category: "shopping", channel: "card", notes: "Pixel 10 — the loud day" },
      { date: "2026-10-03", time: "19:40", vendor: "Zomato", amount: 820, currency: "INR", category: "food", channel: "UPI" },
      { date: "2026-10-04", time: "9:15", vendor: "HDFC Securities", amount: 150000, currency: "INR", category: "transfer:investment", channel: "NEFT", transfer: true, notes: "Gold ETF SIP top-up" },
      { date: "2026-10-05", time: "21:00", vendor: "Spotify", amount: 119, currency: "INR", category: "entertainment", channel: "card", subscription: true },
      { date: "2026-10-05", time: "22:10", vendor: "Anthropic", amount: 20, currency: "USD", category: "software", channel: "card", subscription: true },
      { date: "2026-10-06", time: "14:20", vendor: "GiveIndia", amount: 11000, currency: "INR", category: "charity", channel: "UPI" },
      { date: "2026-10-07", time: "20:15", vendor: "Zomato", amount: 640, currency: "INR", category: "food", channel: "UPI" },
      { date: "2026-10-08", time: "10:02", vendor: "Wise", amount: 412500, currency: "INR", category: "income:freelance", channel: "NEFT", direction: "credit", notes: "October invoice" },
      { date: "2026-10-08", time: "18:30", vendor: "Uber", amount: 340, currency: "INR", category: "transport", channel: "UPI" },
      { date: "2026-10-08", time: "19:12", vendor: "Vercel", amount: 20, currency: "USD", category: "software", channel: "card", subscription: true },
      { date: "2026-10-09", time: "16:44", vendor: null, payee: "UPI-QR-UNKNOWN", amount: 1250, currency: "INR", category: null, channel: "UPI", review: true, reviewReason: "unknown_vendor" },
      { date: "2026-10-10", time: "10:00", vendor: "Tanishq", amount: 90000, currency: "INR", category: "transfer:investment", channel: "card", transfer: true, notes: "2g gold coin" },
      { date: "2026-10-11", time: "8:20", vendor: "GitHub", amount: 4, currency: "USD", category: "software", channel: "card", subscription: true },
      { date: "2026-10-12", time: "13:00", vendor: "Swiggy", amount: 390, currency: "INR", category: "food", channel: "UPI" },
      { date: "2026-10-14", time: "19:00", vendor: "Mom", amount: 5000, currency: "INR", category: "people", channel: "UPI" },
      { date: "2026-10-14", time: "21:30", vendor: "Mobbin", amount: 10, currency: "USD", category: "software", channel: "card" },
      { date: "2026-10-16", time: "12:40", vendor: "Jio", amount: 599, currency: "INR", category: "utilities", channel: "UPI" },
      { date: "2026-10-18", time: "21:10", vendor: "Zomato", amount: 710, currency: "INR", category: "food", channel: "UPI" },
      { date: "2026-10-18", time: "23:00", vendor: "OpenAI", amount: 20, currency: "USD", category: "software", channel: "card" },
      { date: "2026-10-20", time: "9:00", vendor: "FanCode", amount: 299, currency: "INR", category: "entertainment", channel: "UPI" },
      { date: "2026-10-20", time: "11:00", vendor: "1Password", amount: 3, currency: "USD", category: "software", channel: "card", subscription: true },
      { date: "2026-10-22", time: "13:20", vendor: "Swiggy", amount: 540, currency: "INR", category: "food", channel: "UPI" },
      { date: "2026-10-22", time: "16:00", vendor: "X", amount: 8, currency: "USD", category: "software", channel: "card" },
      { date: "2026-10-24", time: "20:00", vendor: "Uber", amount: 280, currency: "INR", category: "transport", channel: "UPI" },
      { date: "2026-10-25", time: "13:00", vendor: "Swiggy", amount: 420, currency: "INR", category: "food", channel: "UPI" },
    ],
    empty: false,
  },
  {
    id: "2026-11",
    label: "November 2026",
    short: "Nov",
    note: null,
    inr: { spent: 0, subscriptions: 0, oneTime: 0, credits: 0, transfers: 0, refunded: 0, byCategory: [] },
    usd: { spent: 0, subscriptions: 0, oneTime: 0, credits: 0, transfers: 0, refunded: 0, byCategory: [] },
    charges: [],
    empty: true,
    upcoming: [
      { date: "2026-11-01", vendor: "Netflix", amount: 649, currency: "INR" },
      { date: "2026-11-01", vendor: "Airtel", amount: 999, currency: "INR" },
      { date: "2026-11-02", vendor: "Cursor", amount: 20, currency: "USD" },
      { date: "2026-11-05", vendor: "Anthropic", amount: 20, currency: "USD" },
    ],
  },
];

export const ANALYSIS = MONTHS.filter((m) => !m.empty).map((m) => ({
  id: m.id,
  short: m.short,
  inr: m.inr.spent,
  usd: m.usd.spent,
  transfers: m.inr.transfers,
}));

export const INSIGHTS_OCT = [
  { kicker: "The loud day", text: "Highest spend day was 3 Oct. Croma ₹1,24,999 plus dinner — ₹1,25,819 in one IST day." },
  { kicker: "Moved, not spent", text: "₹2,40,000 went to gold (HDFC Securities ETF + a Tanishq coin). Listed, excluded from the total." },
  { kicker: "Without the Pixel", text: "October spend would have been ₹24,541 — almost September." },
  { kicker: "USD is rent", text: "$105 this month, all software. Cursor, Claude, Vercel, GitHub, Mobbin, OpenAI, 1Password, X." },
];

export const DIRECTION_META = [
  {
    id: "quiet",
    name: "Quiet Index",
    tag: "Default pick",
    one: "Vercel-ish type, one huge number, prose under it.",
    gesture: "Swipe the hero sideways to change month. Pull the sheet for history.",
  },
  {
    id: "letter",
    name: "Monthly Letter",
    tag: "Editorial",
    one: "Each month is an issue. Ma boi writes the lead.",
    gesture: "Page-turn swipe. Tap the index to open the tape.",
  },
  {
    id: "deck",
    name: "Month Deck",
    tag: "Gestural",
    one: "Full-bleed month cards. Glance, then dive.",
    gesture: "Swipe cards like stories. Drag up for the month tape.",
  },
  {
    id: "receipt",
    name: "Receipt Roll",
    tag: "Tape",
    one: "A thermal receipt per month. History is the object.",
    gesture: "Scroll the tape. Swipe for the previous receipt.",
  },
  {
    id: "twin",
    name: "Twin Ledger",
    tag: "INR · USD",
    one: "Two currencies, two panes. Never a combined total.",
    gesture: "Swipe the shared month rail. Expand one currency.",
  },
  {
    id: "night",
    name: "Night Assay",
    tag: "Dark gold",
    one: "Private desk at night. Gold marks what moved.",
    gesture: "Horizontal month. Vertical into the assay notes.",
  },
];

export const SCREENS = [
  { id: "home", label: "Home" },
  { id: "home-prev", label: "Last month" },
  { id: "switcher", label: "Month swipe" },
  { id: "history", label: "History" },
  { id: "category", label: "Insight" },
  { id: "analysis", label: "Months" },
  { id: "empty", label: "Empty" },
  { id: "edge", label: "Edge" },
];

export function monthById(id) {
  return MONTHS.find((m) => m.id === id) ?? MONTHS[3];
}

export function neighbor(id, delta) {
  const i = MONTHS.findIndex((m) => m.id === id);
  return MONTHS[Math.max(0, Math.min(MONTHS.length - 1, i + delta))];
}

export function chargesFor(month, currency) {
  const rows = month.charges ?? [];
  return currency ? rows.filter((c) => c.currency === currency) : rows;
}

export function displayVendor(row) {
  return row.vendor ?? row.payee ?? "Unknown";
}
