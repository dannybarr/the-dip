// Serverless proxy for Financial Modeling Prep, run by Vercel.
//
// Why this exists: the browser must never see the FMP API key. This function
// runs on Vercel's servers, reads the key from a secret environment variable
// (FMP_API_KEY), relays the request to FMP, and returns the result. It also
// stamps each successful response with a short shared CDN cache header, so one
// real upstream call serves every visitor for the cache window and the free
// tier's daily request budget is respected no matter how much traffic arrives.

const BASE = "https://financialmodelingprep.com/stable";

// Only these endpoints may be relayed. This stops the proxy from being used as
// an open gateway that spends your key on arbitrary FMP calls.
const ALLOWED = new Set([
  "profile",
  "quote",
  "historical-price-eod/full",
  "ratios-ttm",
  "key-metrics-ttm",
  "sector-pe-snapshot",
]);

export default async function handler(req, res) {
  const { path, ...rest } = req.query;
  const endpoint = Array.isArray(path) ? path[0] : path;

  if (!endpoint || !ALLOWED.has(endpoint)) {
    res.status(400).json({ "Error Message": "Unsupported endpoint" });
    return;
  }

  const key = process.env.FMP_API_KEY;
  if (!key) {
    res.status(500).json({ "Error Message": "FMP_API_KEY is not configured on the server" });
    return;
  }

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(rest)) {
    if (typeof v === "string") params.set(k, v);
  }
  params.set("apikey", key);

  try {
    const upstream = await fetch(`${BASE}/${endpoint}?${params.toString()}`);
    const body = await upstream.text();
    if (upstream.ok) {
      // Shared edge cache: fresh for 3 minutes, then served stale for up to
      // 10 more minutes while it revalidates in the background. All visitors
      // share this, so reloads stay cheap and data is at most ~3 minutes old.
      res.setHeader("Cache-Control", "public, s-maxage=180, stale-while-revalidate=600");
    }
    res.status(upstream.status);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.send(body);
  } catch {
    res.status(502).json({ "Error Message": "Upstream fetch to FMP failed" });
  }
}
