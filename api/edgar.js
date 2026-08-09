// Serverless proxy for SEC EDGAR, run by Vercel.
//
// Why this exists, and why EDGAR rather than platform scrapers: Crowdcube,
// Seedrs, Wefunder and StartEngine publish no supported API. Targeting their
// internal endpoints means undocumented shapes, bot protection, and terms of
// service you have to argue about. EDGAR is the opposite: Reg CF issuers are
// legally required to file Form C, the filings are public, the feeds are
// documented, and there is no rate-limit key to protect. It is the one genuinely
// reliable discovery source for crowdfunding raises, so it is the one we use.
//
// SEC requires a descriptive User-Agent with contact details on every request
// and will block traffic without one. Browsers forbid setting User-Agent from
// fetch(), which is the second reason this proxy has to exist.

const CURRENT = "https://www.sec.gov/cgi-bin/browse-edgar";
const ARCHIVES = "https://www.sec.gov/Archives";

// Only these two shapes may be relayed, so the proxy cannot be turned into an
// open gateway for arbitrary SEC traffic attributed to our contact address.
const MODES = new Set(["recent", "filing"]);

function userAgent() {
  // SEC asks for "Sample Company Name AdminContact@example.com".
  const contact = process.env.SEC_CONTACT_EMAIL;
  return contact ? `The Dip Angel Desk ${contact}` : "The Dip Angel Desk contact-not-configured";
}

export default async function handler(req, res) {
  const mode = Array.isArray(req.query.mode) ? req.query.mode[0] : req.query.mode;
  if (!mode || !MODES.has(mode)) {
    res.status(400).json({ error: "Unsupported mode" });
    return;
  }
  if (!process.env.SEC_CONTACT_EMAIL) {
    // Fail loudly rather than sending anonymous traffic to a regulator's server.
    res.status(500).json({
      error:
        "SEC_CONTACT_EMAIL is not configured on the server. SEC requires a contact address in the User-Agent on every request.",
    });
    return;
  }

  let url;
  if (mode === "recent") {
    const count = Math.min(Number(req.query.count) || 40, 100);
    const params = new URLSearchParams({
      action: "getcurrent",
      type: "C",
      dateb: "",
      owner: "include",
      count: String(count),
      output: "atom",
    });
    url = `${CURRENT}?${params.toString()}`;
  } else {
    // A filing path, relayed verbatim but constrained to the Archives tree.
    const path = Array.isArray(req.query.path) ? req.query.path[0] : req.query.path;
    if (!path || !/^[A-Za-z0-9/_.-]+$/.test(path) || path.includes("..")) {
      res.status(400).json({ error: "Invalid filing path" });
      return;
    }
    url = `${ARCHIVES}/${path.replace(/^\/+/, "")}`;
  }

  try {
    const upstream = await fetch(url, {
      headers: { "User-Agent": userAgent(), Accept: "application/atom+xml, application/xml, text/xml, */*" },
    });
    const body = await upstream.text();
    if (upstream.ok) {
      // Form C filings do not change once filed and new ones appear slowly, so a
      // long shared cache is both safe and courteous to the SEC's servers.
      res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=3600");
    }
    res.status(upstream.status);
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.send(body);
  } catch {
    res.status(502).json({ error: "Upstream fetch to SEC EDGAR failed" });
  }
}
