# FMP free-tier: only a fixed symbol allow-list gets history + fundamentals

Summary: On Financial Modeling Prep's free tier, `profile` and `quote` work for
any symbol, but `historical-price-eod/*`, `ratios-ttm`, and `key-metrics-ttm`
return a "Special Endpoint / not available under your current subscription"
message (HTTP 200 with a plain-text body, not JSON) for symbols outside a fixed
allow-list of ~40 mega-caps.

Why it mattered: The original 24-name universe only had 9 names covered live.
The coverage universe had to be rebuilt from the free allow-list (discovered by
probing ~60 large caps: AAPL, MSFT, GOOGL, AMZN, META, NVDA, TSLA, AMD, NFLX,
ADBE, JPM, GS, UNH, JNJ, PFE, NKE, SBUX, DIS, PYPL, COIN, XOM, BA, WMT, TGT and
more). `batch-quote` is also premium — fetch per symbol.

How to apply:
- The provider client must treat a plain-text "Premium/not available" body as a
  soft failure (it throws on `res.json()`; catch per-call and drop the name).
- The daily cap is ~250 calls. Cache TTLs in `fmp.ts` are fundamentals 12h,
  prices 60s, sector 6h; the 60s price TTL is deliberately short so a reload
  refetches through the 3-minute edge cache in `api/fmp.js` (which is what
  actually protects the quota in production). In local dev there is no proxy, so
  a reload every minute hits FMP directly. Verification probing alone can exhaust
  the day's quota, after which the app correctly falls back to the simulated
  snapshot, and once exhausted even a single `profile` call 429s for ~a day.
- Legacy v3 endpoints (`/api/v3/...`) are dead for keys issued after Aug 2025.
  Use the `stable/` endpoints only.

Endpoints that work and map cleanly to the engine's StockInput:
profile (name/sector/industry/beta/marketCap/avgVolume), historical-price-eod/full
(OHLC → RSI/ATR/SMA/drawdown/weekly move), ratios-ttm (margins, TTM P/E),
key-metrics-ttm (EV/EBITDA, netDebt/EBITDA, ROIC, FCF yield), sector-pe-snapshot.

Related: [[dip-engine-assumes-negative-move]]
