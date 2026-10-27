# Ledger

A private tracker for one person's charges (money out), credits (money in) and subscriptions. Data comes in through a
remote MCP server at `/mcp`, called by the personal assistant ("Ma boi") after it reads HDFC alert and vendor receipt
emails. The app never reads email itself. It stores rows, enforces the rules below, and serves a small dashboard.

Stack: Next.js 16 (App Router, TypeScript) · Postgres on Neon · Drizzle ORM · `@modelcontextprotocol/sdk` (Streamable
HTTP, stateless) · Vercel Blob for invoice PDFs · Vitest against a real Postgres.

**Why Drizzle:** its migrations are plain SQL files committed in `drizzle/`, it adds no engine binary to serverless
functions, and it exposes `ON CONFLICT ... WHERE` for the partial unique indexes idempotency depends on.

## The dashboard

One page, two views, behind a password login:

- **This month** (default, IST): one spending card with an INR / USD switch: "spent so far", a strip of
  monthly bars (12 months; click one to open that month), a bar splitting subscriptions from one-time purchases, what
  was received and via what (e.g. Wise over NEFT), and refunds and transfers that were left out. Below it, the month's charges and credits as a **list** or a **calendar** (vendor logos per day). Rows needing
  review are tinted, refunded rows are struck through, credits are green. Click any row to edit vendor, category or
  notes, resolve the review, mark it refunded, or save the vendor as an alias for that payee.
- **Upcoming** (right rail): expected payments for the next 30 days grouped by week with per-currency weekly totals,
  then active subscriptions. Click a subscription to mark it cancelled (with the cancellation date and the date access
  ends) or just set an end date. This never contacts the vendor; the sheet links to the billing page.

Light and dark follow the system; the toggle in the top bar pins either one (kept in a `theme` cookie so the first paint
is already right). Switching between list and calendar, picking a day, and moving between months happen in the browser:
month data comes from `GET /api/month?m=YYYY-MM`, is cached per month, and the months either side are prefetched, so a
switch is instant and an uncached month shows skeletons right away instead of freezing the page.

The month arrows go back through history and forward into future months, where the page shows what is due that month.
Vendor logos come from [Simple Icons](https://simpleicons.org) (Wise, Upwork, Netflix, Spotify, Anthropic, …); vendors
without one get a lettered badge.

### The month in words

`src/domain/narrative.ts` turns a month summary into sentences ("You received ₹2,41,500 from Wise over NEFT, and
moved ₹50,000 to HDFC Securities…"), plus the biggest expense, the highest day, a straight-line projection for the
current month and a comparison with last month. It is pure arithmetic over `getMonthSummary`, so it is always
current and never waits on the assistant. `GET /api/month` returns it as `story` (text as segments with a tone, so
the apps can colour the numbers); `get_month_summary` returns the same under `story`. The assistant's own
observations go in the month note (`set_month_note`, a few newline-separated lines, max 1000 characters) and are
shown next to it; the tool description tells the assistant not to repeat what the story already says.

## The mobile app

`mobile/` is an Expo (React Native) app for the same data: one month per screen, swipe sideways for other months,
pull down for every charge, tap a day. See [mobile/README.md](mobile/README.md). The web app is untouched apart
from the JSON API below.

## JSON API (used by the mobile app)

The dashboard's session JWT is accepted as the cookie or as `Authorization: Bearer <token>` on `/api/*`
(`src/lib/api-auth.ts`); unauthenticated `/api` calls get a 401 JSON body instead of a login redirect.

| Route | What |
| --- | --- |
| `POST /api/login` `{ password }` | `{ token, expires_in }`, the same session JWT the cookie carries |
| `GET /api/month?m=YYYY-MM` | Everything the dashboard shows for a month, plus `story` and `by_category` |
| `PATCH /api/charges/:id` | `{ vendor?, category?, notes?, reviewed?, save_alias?, refunded? }`, the row sheet's edits |
| `PATCH /api/subscriptions/:id` | `{ action: "cancel", cancelled_on?, ended_at? }` or `{ action: "set_end", ended_at }` |

The row edits live in `src/domain/owner.ts` and are shared by the server actions and these routes.

## Business rules (where they live)

All rules are in `src/domain/*`. The MCP tools (`src/mcp/server.ts`), server actions (`app/actions.ts`) and scripts are
thin wrappers.

| Rule | Where |
| --- | --- |
| Per-currency totals only. No FX code anywhere. Money is summed as integer minor units. | `domain/money.ts`, `domain/summary.ts` |
| Refunded debits excluded from spending; the linked refund credit excluded from credits. Credits never count as spending. | `domain/summary.ts` |
| Money moved rather than spent (category `transfer:*`, e.g. `transfer:investment` for the HDFC Securities broker account) is listed and shown under the total, but not counted as spending. Money sent to people (category `people`) does count as spending. | `domain/summary.ts` |
| Month boundaries in IST; timestamps without an offset are IST. | `lib/time.ts` |
| Idempotency on `hdfc_message_id` / `receipt_message_id`: partial unique indexes + `INSERT … ON CONFLICT DO NOTHING`; retries fill nulls, overwrite only with `overwrite: true`. | `domain/charges.ts` |
| Dedup: debit, same currency, amounts within **1.00** (receipt tax rounding), `charged_at` within **±2 days**, and the existing row lacks the other message id. Exactly one candidate merges; more than one inserts with `needs_review` + returns candidates. Bank fields (channel, payee_raw, card_last4, reference, timestamp, amount) come from the alert, receipt fields (vendor, invoice_number, pdf) from the receipt. `source` keeps the original row's value; `merged_from` records what was folded in. | `domain/charges.ts` |
| Vendor aliases: `raw_pattern` is a **case-insensitive substring** of `payee_raw`; the longest matching pattern wins. UPI handles (`@okicici`, `@rxairtel`) are ignored when matching, so a bank handle never names a vendor. | `domain/aliases.ts` |
| Unknown vendor after alias lookup → `needs_review = true` (`review_reason = unknown_vendor`). | `domain/charges.ts` |
| Subscription link: same vendor (case-insensitive) + currency, amount within 1.00 or ≤ mandate `max_amount`, date within ±3 days of `next_charge_date`. Advances `next_charge_date` by the cycle; one-off subscriptions close after their charge. | `domain/subscriptions.ts` |
| Plan change closes the old row (`cancelled`, `ended_at`) and opens a new active row. One active row per (vendor, plan), enforced by a partial unique index. | `domain/subscriptions.ts` |
| Cancel is local only. No outbound request, ever. | `domain/subscriptions.ts` |
| Card/account numbers: any run of 8+ digits in `payee_raw`/`notes` is masked to `XXXX1234`; `card_last4` keeps only the last four digits. | `lib/sanitize.ts` |

### Schema additions beyond the spec

- `charges.review_reason` (`unknown_vendor`, `possible_duplicate`, `flagged`) so alias application only clears reviews
  that were about the vendor, and the UI can say why a row needs a look.
- `charges.merged_from` (jsonb audit of merged rows) so `merge_charges` stays idempotent after the other row is deleted.
- `subscriptions.cancelled_on` (the day you cancelled) next to `ended_at` (the day access ends). On an active row,
  `ended_at` is a planned end date; upcoming projections stop there.
- `upcoming_events` table (used): one-off expected payments and mandate pre-debit notices. `source_message_id` is
  unique, so notices are idempotent. A pending event within ±3 days of a projected subscription charge replaces that
  projection so nothing is counted twice; a matching debit marks it `paid`.
- `month_notes`: the assistant's observations for a month (`set_month_note`), a few newline-separated lines, shown
  above the charts and under the mobile summary.

## MCP server

`POST/GET/DELETE /mcp`, Streamable HTTP in stateless mode with JSON responses. Auth: `Authorization: Bearer $MCP_TOKEN`
(constant-time compare; missing or wrong → `401` with `WWW-Authenticate`). A light per-instance rate limit returns
`429` past 240 requests/minute. Every tool call runs in one database transaction and returns structured JSON (also as
text). Errors come back as `{ "error": { "code", "message", "details?" } }` with `isError: true`.

Tools: `add_charge`, `update_charge`, `merge_charges`, `list_charges`, `mark_refunded`, `upsert_subscription`,
`list_subscriptions`, `upcoming_payments`, `cancel_subscription`, `add_upcoming_event`, `set_upcoming_event_status`,
`attach_invoice`, `get_month_summary`, `set_month_note`, `find_possible_duplicates`, `upsert_vendor_alias`,
`list_vendor_aliases`, `import_csv`. Each description says what is idempotent and what is never done.

### Testing with the MCP Inspector

```bash
npx @modelcontextprotocol/inspector
```

Transport **Streamable HTTP**, URL `http://localhost:3000/mcp` (or `https://<your-app>.vercel.app/mcp`), and add the
header `Authorization: Bearer <MCP_TOKEN>`. Connect, then **List Tools**.

### curl

```bash
curl -s http://localhost:3000/mcp \
  -H "authorization: Bearer $MCP_TOKEN" -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'

curl -s http://localhost:3000/mcp \
  -H "authorization: Bearer $MCP_TOKEN" -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

## Local setup

```bash
npm install
docker compose up -d                 # Postgres 16 with databases ledger and ledger_test (user/pass ledger)
cp .env.example .env                 # then fill it in (see below)
npm run db:migrate
npm run db:seed                      # vendor aliases (Wise → income:freelance, …)
npm run db:seed -- --demo            # optional example rows, all labelled [EXAMPLE DATA]
npm run dev                          # http://localhost:3000
```

For `.env`: `DATABASE_URL=postgres://ledger:ledger@localhost:5432/ledger` (same for `DATABASE_URL_UNPOOLED`),
`MCP_TOKEN=$(openssl rand -base64 32)`, `SESSION_SECRET=$(openssl rand -base64 48)`, and
`OWNER_PASSWORD_HASH` from `npm run hash-password -- 'your password'` (use the base64 form in `.env` files, because
`$` in a raw bcrypt hash can get expanded). Remove example rows with `npm run db:seed -- --purge-demo`. The demo seed
refuses to run in production unless you pass `--force`.

## Tests

```bash
npm test
```

Domain tests run against a real Postgres at `TEST_DATABASE_URL` (default
`postgres://ledger:ledger@localhost:5432/ledger_test`, created by `docker compose`). Each run drops and recreates the
schema and applies the committed migrations. To use a Neon branch instead, create a branch in the Neon console and set
`TEST_DATABASE_URL` to its **direct** connection string. Never point it at production; the tests truncate tables.

The MCP tests use the SDK's `Client` + `StreamableHTTPClientTransport` against the real `/mcp` route handler in-process.
To run them against a live server instead: `npm run dev`, then `MCP_TEST_URL=http://localhost:3000/mcp npm test`
(with the same `MCP_TOKEN` in both environments).

## Backfill import

```bash
npm run import:csv -- path/to/backfill.csv --dry-run   # report only, rolls back
npm run import:csv -- path/to/backfill.csv
```

Or have the assistant call `import_csv` with `csv_text` or `csv_base64` (and `dry_run`). Both use the same function
(`domain/importCsv.ts`). Expected columns: `date,time,direction,amount,currency,channel,vendor_raw,card_last4,
reference,gmail_message_id,flag_unknown_vendor,note`.

The export format Ma boi produces is accepted as well: `datetime_ist` (e.g. `2026-09-02 10:32 (email time)`) instead
of `date`/`time`, `event_type` (`transaction`, `mandate_registered`, `upcoming_mandate`, `autopay_declined`,
`mandate_cancelled`) instead of a mandate value in `direction`, `account_or_card_last4` (kept only on card payments,
since on UPI/NEFT rows it is the account), and `flag_personal_payee` (→ category `people`, counted as spending). Extra columns such
as `subject` are ignored.

- `date` + `time` are IST (`YYYY-MM-DD`, `DD-MM-YYYY`, `DD/MM/YYYY`; `HH:MM[:SS]` or `9:15 PM`).
- `gmail_message_id` → `hdfc_message_id`, so a re-import creates nothing new. Mandate events are keyed by the same id.
- `card_last4` keeps the last four digits (warning in the report if more were given). `flag_unknown_vendor` of
  `true/yes/y/1` → `needs_review`. `vendor_raw` → `payee_raw` → alias resolution; when no alias matches, the payee
  name a UPI alert carries before the `|` becomes the vendor (unless the row is flagged unknown).
- Card reversals (`card refund` channel or `CRV POS …` payee) are linked to the charge they refund when exactly one
  debit from the same vendor within 30 days is within 2% of the amount (forex rounding); that charge is marked refunded.
- **Mandate rule** (first match wins): (1) `direction` starts with `mandate` (`mandate_registered`, `mandate-upcoming`,
  …; the suffix is the type, otherwise the note decides); (2) `direction` is not debit/credit and the note mentions
  "mandate", "e-mandate", "standing instruction", "SI" or "autopay"; (3) the note contains a tag such as
  `mandate_upcoming`. Type keywords are checked in the order declined → cancelled → upcoming → registered.
  - registered → creates or updates an active subscription (amount = mandate max, read from the row or from
    "Max USD 23.60" in the note; cycle from "frequency annual|monthly", "As Presented" counts as monthly). Debits from
    that vendor within ±3 days of the start date (or of up to three earlier cycles) are linked to it, and
    `next_charge_date` is start + cycle when the first payment is found, otherwise the start date.
  - upcoming → pending `upcoming_events` row (date from the note if it contains one, else the row date) and refreshes
    `next_charge_date`.
  - declined → appended to `mandate_info.events`; the nearest pending event is marked declined. No charge. A decline
    that arrives before any subscription for that vendor exists is reported as a warning.
  - cancelled → the subscription carrying that mandate reference (`SI Hub ID …`) is cancelled with `ended_at` = that date.
  - Events never attach to a subscription that started after them, so a re-import changes nothing.
- Rows are processed in time order. The whole file is one transaction; each row has its own savepoint, so a bad row is
  reported with its line number and skipped. The report lists rows read, charges created/existing/merged, credits,
  mandate events applied, rows flagged and rows rejected, and warns if the file doesn't hold 52 transactions + 11
  mandate rows.

## Deploy (GitHub → Neon → Vercel)

1. Push this repo to GitHub.
2. **Neon:** create a project and database. Copy the pooled connection string (host has `-pooler`) and the direct one.
3. **Vercel:** import the GitHub repo. Under Storage, create a **Blob** store and connect it (adds
   `BLOB_READ_WRITE_TOKEN`). Add env vars for Production (and Preview if you use it): `DATABASE_URL` (pooled),
   `DATABASE_URL_UNPOOLED` (direct), `MCP_TOKEN`, `OWNER_PASSWORD_HASH` (raw bcrypt hash is fine here),
   `SESSION_SECRET`, `APP_TIMEZONE=Asia/Kolkata`.
4. Nothing to run by hand: Vercel uses the `vercel-build` script, which applies pending migrations and, on a fresh
   database, seeds the vendor aliases before `next build`. Preview deploys migrate whichever database their env vars
   point at. To do it yourself instead: `DATABASE_URL=<pooled> DATABASE_URL_UNPOOLED=<direct> npm run db:migrate && npm run db:seed`.
5. Deploy. Point Ma boi at `https://<your-app>.vercel.app/mcp` with the bearer header, and run the backfill with a
   dry run first.

## Security notes

- Dashboard: bcrypt password → HS256-signed, httpOnly, `Secure` (in production), `SameSite=Lax` session cookie for 30
  days. `proxy.ts` gates every route except `/login`, `/mcp` and static assets; server actions re-check the session.
- Only `card_last4` is stored; long digit runs in free text are masked before they reach the database.
- Invoice PDFs live in a public Blob store under `invoices/<charge-id>/<128-bit random>/<name>.pdf`, so URLs are
  unguessable. `attach_invoice` via URL only fetches `https://` from public hosts, checks the content type and the
  `%PDF-` header, and caps size at 10 MB.
- Secrets come only from environment variables. The bearer token is never logged.

## Assumptions

- **OAuth is not implemented.** The MCP endpoint uses the static bearer token only, which is what Ma boi needs.
- The HDFC alert is treated as the bank side of a payment and wins for bank fields and the timestamp when merging.
- A debit with no message ids (manual) is never auto-merged; `find_possible_duplicates` surfaces lookalikes.
- `mark_refunded` covers full refunds (the refund credit defaults to the original amount).
- Mandate rows without a recognisable vendor or type are rejected with a reason rather than guessed.
- Subscriptions with `ended_at` in the future stay active; projections stop at that date.
