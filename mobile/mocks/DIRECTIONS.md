# Ledger mobile — directions

Design exploration only. These mocks are static HTML so they can be opened without Xcode, Android Studio, or a paid design tool.

**Open the gallery:** serve this folder and open `index.html`.

```bash
npx --yes serve mobile/mocks -p 4173
```

Then: [http://localhost:4173](http://localhost:4173). Click any phone to play that screen. [compare.html](./compare.html) puts two directions on the same month.

The live web app (`app/`) is unchanged. Sample money is fictional, shaped like the real domain: IST months, INR and USD never summed, `transfer:*` listed but excluded from spend, agent notes as first-class copy.

---

## Architecture (for the later build)

Keep the Next.js dashboard as the desk web client. Add a **new top-level `mobile/`** Expo app (Expo Router) that reads the same Postgres via the existing contracts:

- `GET /api/month?m=YYYY-MM` already returns one month of summary, rows, history strip, note, upcoming
- MCP tools stay the write path for Ma boi (`get_month_summary`, `set_month_note`, `list_charges`, …)
- Domain rules stay in `src/domain/*` — no second database, no FX

A PWA wrap of the current page would inherit the desktop information density Cletus already dislikes. Expo is the better default if a real phone install is wanted. Shared TypeScript types can wait until a direction is chosen; do not extract a monorepo package just for mocks.

Auth: reuse the existing session cookie against the same origin, or a device-bound token later. Out of scope here.

---

## How to look

Each direction has eight screens:

| Screen | What it is |
| --- | --- |
| Home | This month, prose + total |
| Last month | Same home after a swipe (September) |
| Month swipe | Mid-gesture peek at the next issue |
| History | The month’s charges, credits, transfers |
| Insight | One category or agent note, in full |
| Months | Multi-month analysis, currencies still split |
| Empty | November — nothing posted |
| Edge | Unknown UPI review, or metal vs spend |

Gesture in every direction: **horizontal swipe changes month**. History is a dive, not a second dashboard.

---

## 1. Quiet Index — default pick

**Vibe.** Vercel-ish. Off-white, near-black type, one huge number, a short paragraph from Ma boi, hairline category rows with a 3px accent. Almost no chrome.

**Problem it solves.** Today’s web home is a card of charts and a rail. On a phone you want the number, the sentence, then a way out.

**Gesture.** Swipe the hero sideways. Tabs: Home / History / Months.

**Pros.** Closest to “calm, premium, not fintech.” Fast to build in React Native. Prose is not a caption under a donut.  
**Cons.** Least theatrical. Easy to under-design if the type is timid.

**Inspired by.** [Copilot home](https://mobbin.com/screens/39e851c1-7c5d-4f1e-bf81-1c3be05e5566) (review + upcoming, not a pie), [Revolut category list](https://mobbin.com/screens/69913e7a-7c90-4051-9fe1-84f2f55920d9) (black bars, little decoration), [Starling spending](https://mobbin.com/screens/6394c608-710c-4755-9f40-7e0886dd1534).

---

## 2. Monthly Letter

**Vibe.** Cream paper, Newsreader, masthead, pull quote. Each month is an issue. Ma boi writes the lead.

**Problem it solves.** Agent notes are currently a one-line banner above charts. Here the note *is* the home screen.

**Gesture.** Page-turn swipe between issues. The dotted index is the category dive.

**Pros.** Unique. Makes “informative, not just charts” literal. Empty state (“No issue.”) is charming.  
**Cons.** Serif-on-cream can feel literary if the writing is weak. Harder to scan a number in a hurry.

**Build if** you want the assistant’s voice to be the product.

---

## 3. Month Deck

**Vibe.** Dark, coral spark, full-bleed cards, story dots. Glance a month, drag up for the tape.

**Problem it solves.** Month switching on the web is chevrons and a tiny bar strip. Here the month *is* the card.

**Gesture.** Horizontal card stack. Vertical sheet for history.

**Pros.** Most “mobile.” Dots teach the model in one glance.  
**Cons.** More motion, more chrome. Coral can get loud if overused.

**Inspired by.** [Monzo month chart](https://mobbin.com/screens/0ee03dc9-3c12-4c3a-8725-4320efc7acf5), [Up day-grouped history](https://mobbin.com/screens/a90bf60a-2840-4e9f-a601-565c4346be1a).

---

## 4. Receipt Roll

**Vibe.** Dark desk, one thermal tape, IBM Plex Mono, perforated edges. History is the object, not a view.

**Problem it solves.** A freelancer already thinks in alerts and invoices. The month as a receipt is honest.

**Gesture.** Scroll the tape. Swipe for the previous receipt. `*` = moved to metal. `!` = needs review.

**Pros.** Distinct, cheap to implement, delightful empty “VOID”.  
**Cons.** Dense. Not the most premium. Long months get tall.

---

## 5. Twin Ledger

**Vibe.** Two panes, always. Indigo INR, teal USD. A “No FX” caption where a combined total would have been.

**Problem it solves.** The web currency switch hides one book. Cletus holds both; October INR is a Pixel and October USD is software rent. They are not one number.

**Gesture.** Shared month swipe. Expand a pane for that currency’s tape.

**Pros.** Makes the hardest product rule visible. Analysis is two bar charts, never summed.  
**Cons.** Home is split; less room for prose. Can feel like settings.

---

## 6. Night Assay

**Vibe.** OLED black, Fraunces, gold. “Assay” as in testing metal. Transfers are a gold rule, not a footnote.

**Problem it solves.** Gold ETF + coin are a real monthly act. Most spend apps bury “excluded from total.”

**Gesture.** Gold month chips. Vertical into the assay notes.

**Pros.** Premium, night-phone native, investment-aware.  
**Cons.** Dark-only. Gold can look “crypto” if the type slips.

---

## Recommendation

**Ship Quiet Index first.** It matches the taste note (calm, Vercel-ish, no cluttered chrome), puts prose under a single number, and the swipe model ports cleanly to Expo.

**Keep Monthly Letter as the alternate** if the agent’s monthly note should be the home, not a supporting line.

Twin Ledger is a *rule* more than a skin — whatever you pick, INR/USD must stay split. Night Assay’s metal treatment should land in Quiet as a single “moved, not spent” line (already sketched). Deck and Receipt are worth stealing from (dots, VOID, `*`/`!`) rather than building whole.

---

## What a later build should reuse

From `src/domain/summary.ts`: `spent`, `subscriptions`, `one_time`, `credits`, `transfers`, `transfers_by_category`, `by_category`, `daily`, `note`.  
From `app/dashboard/types.ts`: `MonthData`, `ChargeRow`.  
Do not invent a merged “total wealth” figure. Do not put these mocks on the Vercel production origin (they are not gated).
