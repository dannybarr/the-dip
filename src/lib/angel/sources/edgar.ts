/**
 * Discovery: live Reg CF raises from SEC EDGAR.
 *
 * Every US crowdfunding issuer must file a Form C before taking money, so the
 * EDGAR "current filings" feed is a complete, official, free list of live US
 * raises. No scraping, no bot protection, no terms-of-service argument.
 *
 * Two deliberate limits, stated here rather than discovered later:
 *
 *  - This surfaces US Reg CF only. UK platforms publish no equivalent feed, so
 *    UK deals are entered by hand and enriched from Companies House. Pretending
 *    otherwise would mean four scrapers that break silently, and a silent
 *    scraper failure is the worst outcome available: it produces a deal with no
 *    revenue, no valuation and no terms, which is indistinguishable from a
 *    company that disclosed nothing, and the engine would then penalise the
 *    company for our bug.
 *  - A Form C tells you a raise exists and gives you structured offering terms.
 *    It is not diligence. It is the name to look up.
 */
import type { Deal, Platform, Sector, Stage } from "../types";

const PROXY = "/api/edgar";

/**
 * What a Form C variant actually means. Getting this wrong would put annual
 * reports from companies that raised years ago onto a page headed "live raises".
 *
 *   C     new offering statement: a raise opening
 *   C/A   amendment to an offering statement: still a live raise
 *   C-U   progress update on an offering already under way
 *   C-AR  annual report from an issuer that has already raised
 *   C-TR  termination of reporting
 *   C-W   withdrawal of an offering
 */
export type FormCKind = "offering" | "amendment" | "update" | "annual_report" | "withdrawal" | "other";

export function classifyForm(formType: string): FormCKind {
  const t = formType.toUpperCase().trim();
  if (t === "C") return "offering";
  if (t === "C/A") return "amendment";
  if (t.startsWith("C-U")) return "update";
  if (t.startsWith("C-AR")) return "annual_report";
  if (t.startsWith("C-W")) return "withdrawal";
  if (t.startsWith("C-TR")) return "other";
  return "other";
}

/** Filings that represent a raise you could actually participate in. */
export const LIVE_RAISE_KINDS: FormCKind[] = ["offering", "amendment"];

export interface EdgarListing {
  companyName: string;
  cik: string;
  accessionNumber: string;
  filedAt: string;
  formType: string;
  kind: FormCKind;
  /** Path under /Archives, usable with the filing proxy mode. */
  filingPath: string;
  edgarUrl: string;
}

/** Fields the parser tried and failed to read. Our bug, not their opacity. */
export interface ParseReport<T> {
  items: T[];
  unparsed: string[];
}

function text(node: Element | null | undefined): string | undefined {
  const v = node?.textContent?.trim();
  return v || undefined;
}

/**
 * Parse the EDGAR current-filings Atom feed.
 *
 * Guarded field by field: a layout change should cost one field and be recorded,
 * never throw away the whole result.
 */
export function parseCurrentFeed(xml: string): ParseReport<EdgarListing> {
  const unparsed: string[] = [];
  const items: EdgarListing[] = [];

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml, "application/xml");
  } catch {
    return { items: [], unparsed: ["feed"] };
  }
  if (doc.querySelector("parsererror")) return { items: [], unparsed: ["feed"] };

  for (const entry of Array.from(doc.querySelectorAll("entry"))) {
    // Titles look like "C - Company Name (0001234567) (Filer)".
    const title = text(entry.querySelector("title"));
    const href = entry.querySelector("link")?.getAttribute("href") ?? undefined;
    const updated = text(entry.querySelector("updated"));
    if (!title || !href) {
      unparsed.push("entry");
      continue;
    }

    // Real form types carry suffixes and separators: C, C/A, C-U, C-AR, C-W.
    // The character class must allow the slash or every amendment falls through
    // to the fallback and reports the whole title as the company name.
    const nameMatch = title.match(/^\s*([A-Z0-9/-]+)\s+-\s+(.+?)\s*\((\d{7,10})\)/);
    const formType = nameMatch?.[1] ?? "C";
    const companyName = nameMatch?.[2] ?? title;
    const cik = nameMatch?.[3] ?? "";
    if (!nameMatch) unparsed.push("title");

    // Accession number, canonically hyphenated. The URL contains it twice: once
    // un-hyphenated as the directory name and once hyphenated in the filename,
    // so match the hyphenated form first and normalise the bare one if that is
    // all we get.
    const hyphenated = href.match(/(\d{10}-\d{2}-\d{6})/)?.[1];
    const bare = href.match(/(\d{18})/)?.[1];
    const accession =
      hyphenated ?? (bare ? `${bare.slice(0, 10)}-${bare.slice(10, 12)}-${bare.slice(12)}` : "");
    if (!accession) unparsed.push("accession");

    const archivePath = href.split("/Archives/")[1];

    items.push({
      companyName,
      cik,
      accessionNumber: accession,
      filedAt: updated ?? "",
      formType,
      kind: classifyForm(formType),
      filingPath: archivePath ?? "",
      edgarUrl: href,
    });
  }
  return { items, unparsed: [...new Set(unparsed)] };
}

/** Structured offering terms from a Form C primary document. */
export interface FormCOffering {
  issuerName?: string;
  offeringAmount?: number;
  maximumOfferingAmount?: number;
  securityType?: string;
  price?: number;
  deadline?: string;
  jurisdiction?: string;
}

export function parseFormC(xml: string): { offering: FormCOffering; unparsed: string[] } {
  const unparsed: string[] = [];
  const offering: FormCOffering = {};
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml, "application/xml");
  } catch {
    return { offering, unparsed: ["document"] };
  }

  const grab = (tag: string): string | undefined => {
    const el = doc.getElementsByTagName(tag)[0] ?? doc.getElementsByTagName(tag.toLowerCase())[0];
    return el?.textContent?.trim() || undefined;
  };
  const num = (tag: string): number | undefined => {
    const raw = grab(tag);
    if (raw === undefined) {
      unparsed.push(tag);
      return undefined;
    }
    const n = Number(raw.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : undefined;
  };

  offering.issuerName = grab("nameOfIssuer") ?? grab("issuerName");
  offering.offeringAmount = num("offeringAmount");
  offering.maximumOfferingAmount = num("maximumOfferingAmount");
  offering.securityType = grab("securityOfferedType") ?? grab("typeOfSecurityOffered");
  offering.deadline = grab("deadlineDate");
  offering.jurisdiction = grab("jurisdictionOrganization");
  const p = grab("price");
  if (p) {
    const n = Number(p.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(n)) offering.price = n;
  }

  return { offering, unparsed: [...new Set(unparsed)] };
}

/**
 * Turn a discovered filing into a Deal skeleton.
 *
 * Everything a Form C does not carry is left undefined on purpose, so the
 * evidence profile records it as undisclosed and generates the research task.
 * Filling gaps with defaults here would be the single most damaging thing this
 * module could do: it would make an unknown look like a fact.
 */
export function listingToDeal(listing: EdgarListing, offering: FormCOffering, unparsed: string[] = []): Deal {
  return {
    dealId: `edgar:${listing.accessionNumber || listing.cik}`,
    companyName: offering.issuerName ?? listing.companyName,
    platform: "other" as Platform,
    sector: "other" as Sector,
    stage: "unknown" as Stage,
    country: "US",
    url: listing.edgarUrl,
    founders: [],
    traction: {},
    terms: {
      targetRaise: offering.offeringAmount,
      shareClass: "unknown",
      // SEIS and EIS are UK reliefs. A US issuer cannot carry either, and saying
      // so plainly is better than leaving it to be inferred.
      taxWrapper: "NONE",
    },
    registry: {
      companyNumber: listing.cik,
      filingHealth: "current",
      accountsOverdue: false,
      confirmationStatementOverdue: false,
      outstandingCharges: 0,
      activeDirectors: 0,
      source: "sec_edgar",
      fetchedAt: new Date().toISOString(),
    },
    network: {},
    unparsed,
    discoveredAt: listing.filedAt,
  };
}

/** Thrown when the proxy is absent rather than when EDGAR returned bad data. */
export class DiscoveryUnavailableError extends Error {}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    let detail = "";
    try {
      detail = ((await res.json()) as { error?: string }).error ?? "";
    } catch {
      /* non-JSON error body, the status is enough */
    }
    throw new DiscoveryUnavailableError(detail || `EDGAR request failed with ${res.status}`);
  }
  const body = await res.text();
  // A dev server with no serverless runtime answers every path with the SPA
  // shell. Without this check that arrives as "the parser broke", which is
  // exactly the misdiagnosis this module exists to avoid: our missing endpoint
  // must never be reported as a data problem.
  if (/^\s*<!doctype html|^\s*<html/i.test(body)) {
    throw new DiscoveryUnavailableError(
      "The /api/edgar proxy returned an HTML page rather than XML, which means the serverless function is not running. Discovery needs `vercel dev` locally, or a deployment.",
    );
  }
  return body;
}

/**
 * Recent Form C filings.
 *
 * The feed mixes new offerings with progress updates, annual reports and
 * withdrawals from issuers who raised long ago. `liveOnly` keeps the ones that
 * are actually a raise you could join, which is the honest reading of the page
 * title. Pass false to see everything the feed carried.
 */
export async function discoverRecentRaises(count = 40, liveOnly = true): Promise<ParseReport<EdgarListing>> {
  const xml = await fetchText(`${PROXY}?mode=recent&count=${count}`);
  const report = parseCurrentFeed(xml);
  if (!liveOnly) return report;
  return { ...report, items: report.items.filter((i) => LIVE_RAISE_KINDS.includes(i.kind)) };
}

/** Structured offering terms for one discovered filing. */
export async function fetchOffering(listing: EdgarListing): Promise<{ offering: FormCOffering; unparsed: string[] }> {
  if (!listing.filingPath) return { offering: {}, unparsed: ["filingPath"] };
  // The filing index links to primary_doc.xml alongside it.
  const dir = listing.filingPath.replace(/\/[^/]*$/, "");
  const xml = await fetchText(`${PROXY}?mode=filing&path=${encodeURIComponent(`${dir}/primary_doc.xml`)}`);
  return parseFormC(xml);
}
