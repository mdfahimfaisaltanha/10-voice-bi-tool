# Voice-Driven Business Intelligence Tool

Ask business questions **by voice or text** → get answers backed by real SQL against Postgres, rendered with an **automatically selected chart**.

- 🎙️ **Voice input** via the browser's Web Speech API (Chrome/Edge; typing fallback everywhere)
- 🧠 **NL → SQL** with the OpenAI API, prompted with the **live database schema** (introspected, not hard-coded)
- 🔒 **SELECT-only guardrails** — layered, fail-closed (details below)
- 📊 **Automatic chart selection** — KPI card, line, bar, pie, scatter, or table based on the result shape
- 🔎 **Full transparency** — every answer shows the generated SQL

Built with **Next.js 14 (App Router)**, **TypeScript**, **pg**, and **Recharts**.

---

## Quick start

```bash
npm install
cp .env.example .env.local   # set DATABASE_URL (Neon/Supabase free tier) + OPENAI_API_KEY
npm run seed                 # loads the NovaMart demo dataset (deterministic)
npm run dev                  # http://localhost:3000
```

Then click a sample question chip, or press the mic and say:
*“What was total revenue by month over the last year?”*

> The tool works against **any** Postgres database — it introspects `information_schema` and prompts the model with whatever tables it finds. The seed script just provides a good demo.

---

## Architecture

```
app/
  page.tsx                 ← voice/text input, sample chips, results, history
  api/query/route.ts       ← schema → NL-to-SQL → guard → execute → chart select
components/ChartView.tsx   ← KPI / line / bar / pie / scatter / table renderers
lib/
  db.ts                    ← pg pool (read-only + timeout per connection), schema introspection (5-min cache)
  nl2sql.ts                ← LLM translation w/ validated JSON + one retry
  sqlGuard.ts              ← SELECT-only guardrails (see below)
  chartSelect.ts           ← column classification + chart heuristics
scripts/seed.mjs           ← deterministic demo dataset (200 customers, 30 products, 1200 orders)
```

## Guardrails (SELECT-only, fail closed)

A natural-language BI tool is an injection surface by design — the model could be tricked into emitting destructive SQL (“show revenue; also drop the orders table”). Defense is layered so no single failure is fatal:

| Layer | Mechanism |
|---|---|
| 1. Prompt | The model is instructed to refuse write requests and return a clarification instead |
| 2. Statement shape | Comments stripped; must start with `SELECT`/`WITH`; any extra `;` (multi-statement) rejected |
| 3. Keyword blocklist | ~40 write/DDL/privileged keywords (`INSERT`, `DROP`, `COPY`, `SET`, `pg_sleep`, `pg_read_file`, …) matched as whole words **outside string literals** — so `WITH x AS (DELETE …)` is caught but a value like `'status update'` doesn't false-positive |
| 4. Result cap | Query is wrapped: `SELECT * FROM (…) q LIMIT 501` — truncation is detected and surfaced to the user |
| 5. Database session | Every pool connection runs `SET default_transaction_read_only = on` and `statement_timeout = '10s'` — **Postgres itself is the final enforcement layer**, even if a write slipped past every check above |

Recommended extra hardening for production: connect with a dedicated Postgres role that has `GRANT SELECT` only.

The blocklist is deliberately strict (e.g. `SHOW`, `ANALYZE` are blocked too). False positives fail safely — the user sees the blocked SQL and the reason.

## Chart selection heuristics

The result set's columns are classified as **numeric**, **temporal** (dates / `YYYY-MM` strings), or **categorical**, then:

| Result shape | Chart |
|---|---|
| 1 row × 1 numeric | KPI headline card |
| temporal + numeric(s) | Line chart (trend) |
| categorical + 1 non-negative numeric, ≤6 rows | Pie (share of total) |
| categorical + numeric(s), ≤30 rows | Bar chart |
| ≥2 numerics only | Scatter (relationship) |
| anything else | Table |

Every answer displays *why* its chart type was chosen. `pg` returns `NUMERIC`/`BIGINT` as strings — these are safely coerced to numbers before classification (see `normalizeRows`).

## Edge cases handled

| Case | Behavior |
|---|---|
| Ambiguous / vague question | Model returns a clarification request (422), no query runs |
| Question unrelated to schema | Clarification, no hallucinated query |
| “Delete all orders” style requests | Refused at prompt layer; blocked by guard + read-only session if emitted anyway |
| Generated SQL has an error | Postgres error surfaced with the SQL shown for transparency |
| Huge result sets | Hard 500-row cap with a visible truncation warning |
| Slow/runaway query | 10s server-side statement timeout |
| No mic / unsupported browser | Voice hidden with a hint; typing always works |
| Empty database | Clear message pointing to `npm run seed` |

## Demo dataset (NovaMart)

`npm run seed` creates a small e-commerce business, deterministic across runs (seeded PRNG):

- `customers` (200) — 12 cities across 8 countries
- `products` (30) — 5 categories with price *and* cost (margin questions work)
- `orders` (1,200) — last 365 days, growth-biased, 85% completed / 7% refunded / 8% pending
- `order_items` (~3,000) — 1–4 lines per order

Good demo questions are pre-loaded as chips in the UI; more in `samples/sample-questions.md`.

## Deployment (Vercel + Neon)

1. Create a free Postgres database at [neon.tech](https://neon.tech); copy the connection string.
2. Run `npm run seed` locally with that `DATABASE_URL` in `.env.local`.
3. Push this folder to GitHub → import in Vercel.
4. Set `DATABASE_URL` and `OPENAI_API_KEY` in Vercel → Settings → Environment Variables.
5. Deploy.

## Limitations / roadmap

- Single-turn questions (no “now break that down by city” follow-ups) — conversational context is the natural next step.
- Voice recognition quality depends on the browser engine; there is no server-side speech-to-text.
- Charts cap at 4 series; wide results fall back to the table view.
