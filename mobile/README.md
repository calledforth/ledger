# Ledger · mobile

The phone app for the ledger: one month per screen, the month said in words, every charge a pull away. Expo and
React Native, talking to the deployed web app's JSON API. The web app is unchanged except for the four routes in
`app/api/` it needs.

## Run it

```bash
cd mobile
npm install
cp .env.example .env          # optional: EXPO_PUBLIC_API_URL=https://<your-ledger>.vercel.app
npx expo start                # scan the QR with Expo Go, or press i / a for a simulator
```

The sign-in screen asks for the server address (your Vercel URL) and the dashboard password. The address is kept on
the device, so a prebuilt APK works without any `.env`; `EXPO_PUBLIC_API_URL` only pre-fills it. Nothing secret
lives in the app: the server's secrets (database, MCP token, password hash, session secret) stay in Vercel. The app keeps the session token in the device keychain (expo-secure-store)
and sends it as `Authorization: Bearer …`. Thirty days later it asks again, same as the web cookie.

Build for a device with EAS (`npx eas build`) or `npx expo run:ios` / `run:android` once native tooling is set up.

## What's on screen

- **Home, one scroll per month.** The number, the second currency kept apart, then the month in words: received,
  moved to investing, subscriptions, the rest by category. Below: the biggest expense (with the highest day),
  where it went, what's due in the next 7 days, what needs a look, and how it compares with last month.
- **Swipe sideways** for another month. Months are cached and the neighbours prefetched, so the swipe is instant.
- **Pull the home down** past the top to open every charge, grouped by day, with filter chips (review, subs,
  currency, category). Swipe a row left to mark it refunded; hold a row to edit it or name the vendor.
- **Tap anything dated** (highest day, a day header in the list) for that day's sheet, with the day before and
  after one tap away.
- **Naming a vendor** saves a vendor alias for that payee, so the agent categorises the next charge from them
  on its own. This is the one bit of categorisation the app asks you for, and only when the agent couldn't.
- **The note** under the summary is the agent's (`set_month_note`): a few lines on why the month looks the way it
  does. The numbers and sentences above it are computed by the server from the charges.

## How it fits the server

| App | Server |
| --- | --- |
| Sign in | `POST /api/login` → session token |
| A month | `GET /api/month?m=YYYY-MM` (`story` is the month in words, see `src/domain/narrative.ts`) |
| Edit / refund / name a vendor | `PATCH /api/charges/:id` |
| Cancel a subscription | `PATCH /api/subscriptions/:id` |

`src/types.ts` mirrors the server's `MonthData`; change both together.

## Layout

```
App.tsx                 fonts, session, login vs pager
src/api.ts              fetch + token storage
src/store.ts            per-month cache, prefetch, refresh after edits
src/screens/MonthPager  horizontal pager of months
src/screens/MonthScreen the home scroll (hero, biggest expense, where it went, recurring, needs a look)
src/screens/HistorySheet every charge, grouped by day, filter chips
src/screens/DaySheet    one day
src/components/         Story (the worded summary), ChargeRow (swipe / hold), EditChargeSheet, Badge, Card
src/theme.ts            colours, fonts, category colours
src/format.ts           money (Indian grouping), dates
```
