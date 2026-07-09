# The Dip — Institutional Dip Research Terminal

**When they say "buy the dip," this is where the decision gets made.**

The Dip identifies stocks selling off today and this week, then underwrites each one the way a
world-class analyst managing high-profile capital would: with a repeatable framework, an explicit
verdict, and a complete trade plan — or an explicit refusal to trade.

## What it does

- **Dip Scanner** — every covered name down on the day or week, ranked by Dip Score, with catalyst
  headlines, RSI, volume signature, sparkline tape, and one-click filtering by verdict, sector, and
  timeframe.
- **Six-pillar analyst engine** — each dip is scored 0–100 across weighted pillars:
  Business Quality (22%), Catalyst Severity (22%), Valuation Reset (18%), Dip Character (18%),
  Technical Setup (12%), Flow & Sentiment (8%). Composite scores map to verdicts —
  **Buy the Dip / Accumulate / Watchlist / Falling Knife / Avoid** — with hard gates so a great
  composite built on a rotten catalyst never earns a buy.
- **Full underwriting page per stock** — thesis, desk note, one-year chart with support/stop/target
  overlays, trade plan (entry zone, stop, two targets, risk:reward, win rate, expected value,
  volatility-adjusted position size), bull/bear case, catalyst severity vs transience, risk flags,
  fundamentals, technicals, and covered peers. Falling knives and avoids get **no levels published**
  — by design.
- **Watchlist & positions** — track names, log entries against the desk's plans, monitor open P&L.
- **Methodology** — the full investment doctrine, verdict bands, and trade-construction rules.

## Data mode

The terminal currently runs on a **simulated research snapshot** (desk-authored fixtures in
`src/data/universe.ts`, deterministic price series in `src/lib/engine/series.ts`). The engine,
scoring, and workflow are fully real; the quotes are not live. To go live, replace the provider in
`src/lib/engine/market.ts` with a real market-data feed (Polygon, Finnhub, IEX, etc.) supplying the
`StockInput` shape.

**Nothing in this application is investment advice.** Verdicts are model output intended to
structure your own judgment. Short-term trading involves substantial risk of loss.

## Stack

Vite · React 18 · TypeScript · Tailwind (custom terminal design system) · Recharts · Vitest

## Development

```sh
npm install
npm run dev        # dev server on :8080
npm test           # engine + series test suite
npm run build      # production build
```

Key modules:

| Path | Purpose |
| --- | --- |
| `src/lib/engine/analyst.ts` | The scoring brain: six pillars, verdict gates, trade-plan construction |
| `src/lib/engine/indicators.ts` | RSI, moving averages, support detection, dip z-score |
| `src/lib/engine/series.ts` | Deterministic one-year price series calibrated to each dip |
| `src/data/universe.ts` | Coverage universe: fundamentals, catalysts, bull/bear cases, desk notes |
| `src/pages/` | Scanner, StockAnalysis, Watchlist, Methodology |
