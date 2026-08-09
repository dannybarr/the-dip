import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, ExternalLink, RefreshCw } from "lucide-react";
import {
  discoverRecentRaises,
  fetchOffering,
  listingToDeal,
  type EdgarListing,
} from "@/lib/angel/sources/edgar";
import { assessAll } from "@/lib/angel/engine";
import type { AngelAssessment, AngelVerdict, Deal } from "@/lib/angel/types";
import { cn } from "@/lib/utils";

const VERDICT_META: Record<AngelVerdict, { label: string; tone: string; blurb: string }> = {
  ELIGIBLE: {
    label: "Eligible",
    tone: "text-up border-up/40 bg-up/5",
    blurb: "Nothing disqualifying, and enough disclosed to underwrite.",
  },
  ELIGIBLE_WITH_FLAGS: {
    label: "Eligible, flagged",
    tone: "text-warnhot border-warnhot/40 bg-warnhot/5",
    blurb: "Passes the filter, but carries something you should price in.",
  },
  INSUFFICIENT_DATA: {
    label: "Cannot underwrite",
    tone: "text-gold border-gold/40 bg-gold/5",
    blurb: "Too little disclosed to form a judgement. That is itself the finding.",
  },
  REJECTED: {
    label: "Rejected",
    tone: "text-down border-down/40 bg-down/5",
    blurb: "A disqualifying fact no other strength offsets.",
  },
};

/**
 * Surfacing runs on SEC EDGAR rather than platform scrapers.
 *
 * Every US Reg CF issuer must file a Form C before taking money, so this feed is
 * a complete official list of live US raises. UK platforms publish no equivalent,
 * and pointing scrapers at them would produce deals with no revenue, valuation or
 * terms whenever a layout changed, which is indistinguishable from a company that
 * disclosed nothing. Rather than charge our bugs to their opacity, UK deals are
 * entered by hand.
 */
function useDiscovery(limit: number) {
  return useQuery({
    queryKey: ["angel", "edgar", limit],
    queryFn: async () => {
      const { items, unparsed } = await discoverRecentRaises(limit);
      const deals: Deal[] = [];
      // Offering detail is one request per filing, so keep the batch small and
      // degrade to the listing alone when a document cannot be read.
      const detailed = items.slice(0, 12);
      for (const listing of detailed) {
        try {
          const { offering, unparsed: u } = await fetchOffering(listing);
          deals.push(listingToDeal(listing, offering, u));
        } catch {
          deals.push(listingToDeal(listing, {}, ["primary_doc"]));
        }
      }
      for (const listing of items.slice(12)) deals.push(listingToDeal(listing, {}, ["primary_doc"]));
      return { assessments: assessAll(deals), feedUnparsed: unparsed, listings: items };
    },
    staleTime: 15 * 60 * 1000,
    retry: 1,
  });
}

function AssessmentCard({ a, listing }: { a: AngelAssessment; listing?: EdgarListing }) {
  const [open, setOpen] = useState(false);
  const meta = VERDICT_META[a.verdict];

  return (
    <div className="panel">
      <button onClick={() => setOpen((o) => !o)} className="row-hover flex w-full items-start gap-4 p-4 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-foreground">{a.companyName}</span>
            <span className={cn("micro rounded-sm border px-1.5 py-0.5", meta.tone)}>{meta.label}</span>
            {a.network.band !== "NONE" && (
              <span className="micro rounded-sm border border-cyanline/40 bg-cyanline/5 px-1.5 py-0.5 text-cyanline">
                Network {a.network.band.toLowerCase()}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {listing?.formType === "C/A" && <span className="text-gold">Amendment to a live offering. </span>}
            {meta.blurb}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <div className="text-right">
            <div className="micro">Must return</div>
            <div className="num text-sm font-semibold text-gold">{a.hurdle.hurdleMultiple.toFixed(2)}x</div>
          </div>
          <div className="text-right">
            <div className="micro">Undisclosed</div>
            <div className="num text-sm text-muted-foreground">{(a.opacityIndex * 100).toFixed(0)}%</div>
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </div>
      </button>

      {open && (
        <div className="border-t border-hairline px-4 pb-4 pt-3">
          <div className="space-y-1.5">
            {a.rationale.map((line, i) => (
              <p key={i} className="text-sm leading-relaxed text-foreground">{line}</p>
            ))}
          </div>

          {a.vetoes.length > 0 && (
            <div className="mt-4">
              <div className="panel-title">Vetoes</div>
              <div className="mt-2 space-y-2">
                {a.vetoes.map((v) => (
                  <div key={v.code} className={cn("rounded-sm border px-3 py-2", v.hard ? "border-down/40 bg-down/5" : "border-warnhot/40 bg-warnhot/5")}>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className={cn("h-3.5 w-3.5", v.hard ? "text-down" : "text-warnhot")} />
                      <span className="micro">{v.hard ? "Disqualifying" : "Flag"} · {v.code.replace(/_/g, " ")}</span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{v.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {a.researchTasks.length > 0 && (
            <div className="mt-4">
              <div className="panel-title">Diligence list, ranked by what the gap costs</div>
              <ol className="mt-2 space-y-1.5">
                {a.researchTasks.slice(0, 6).map((t, i) => (
                  <li key={i} className="flex gap-2.5 text-xs leading-relaxed text-muted-foreground">
                    <span className="num shrink-0 text-gold">{String(i + 1).padStart(2, "0")}</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="mt-4">
            <div className="panel-title">Network value</div>
            <div className="mt-2 rounded-sm border border-hairline bg-panel-2 px-3 py-2">
              <div className="flex items-baseline gap-2">
                <span className="num text-sm font-semibold text-cyanline">{a.network.band}</span>
                {a.network.band !== "NONE" && <span className="num text-xs text-muted-foreground">{a.network.score}/100</span>}
              </div>
              {a.network.reasons.map((r, i) => (
                <p key={i} className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{r}</p>
              ))}
              <p className="mt-2 text-xs italic leading-relaxed text-muted-foreground">{a.network.caveat}</p>
            </div>
          </div>

          {listing?.edgarUrl && (
            <a href={listing.edgarUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-gold hover:underline">
              Form C filing <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export default function AngelDeals() {
  const [limit, setLimit] = useState(40);
  const { data, isLoading, isFetching, error, refetch } = useDiscovery(limit);

  const listingsById = new Map(
    (data?.listings ?? []).map((l) => [`edgar:${l.accessionNumber || l.cik}`, l]),
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="micro text-gold">Angel Desk</div>
          <h1 className="mt-1 font-mono text-2xl font-bold uppercase tracking-tight text-foreground">Live Raises</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Every US Reg CF issuer must file a Form C with the SEC before taking money, so this is the complete
            official list of live US crowdfunding raises, not a scrape of a marketing page. Each one is run through
            the filter: vetoes first, then the hurdle it has to clear, then what it would take to underwrite it.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="row-hover flex shrink-0 items-center gap-2 rounded-sm border border-hairline px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
          Refresh
        </button>
      </div>

      {isLoading && (
        <div className="panel mt-6 p-8 text-center">
          <div className="micro text-gold">Reading the SEC filing feed…</div>
        </div>
      )}

      {error && (
        <div className="panel mt-6 border-warnhot/40 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warnhot" />
            <span className="micro text-warnhot">Discovery unavailable</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-foreground">
            {error instanceof Error ? error.message : "The EDGAR proxy did not respond."}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            In production this also needs <span className="num">SEC_CONTACT_EMAIL</span> set: the SEC requires a
            contact address in the User-Agent on every request and blocks traffic without one.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            This panel deliberately shows nothing rather than falling back to sample deals. A discovery surface that
            silently substitutes fixtures for live filings is worse than one that is plainly broken.
          </p>
        </div>
      )}

      {data && (
        <>
          {data.feedUnparsed.length > 0 && (
            <div className="panel mt-4 border-warnhot/40 px-4 py-3">
              <span className="micro text-warnhot">Parser degraded</span>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Fields the adapter failed to read: {data.feedUnparsed.join(", ")}. This is our bug, not their
                non-disclosure, and it is reported separately so it never gets charged to a company as opacity.
              </p>
            </div>
          )}

          <div className="mt-3 flex items-center gap-3">
            <span className="micro">{data.assessments.length} filings</span>
            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="rounded-sm border border-hairline bg-panel-2 px-2 py-1 font-mono text-xs text-foreground">
              {[20, 40, 60, 100].map((n) => <option key={n} value={n}>{n} most recent</option>)}
            </select>
          </div>

          <div className="mt-3 space-y-2">
            {data.assessments.map((a) => (
              <AssessmentCard key={a.dealId} a={a} listing={listingsById.get(a.dealId)} />
            ))}
          </div>

          <p className="mt-6 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            A Form C tells you a raise exists and gives you the offering terms. It is not diligence, and this desk
            does not rank these deals: the economics it is built on say breadth beats selection, so it filters and
            leaves position count to do the work. Eligible means nothing disqualifying was found, not that the deal
            is good. US raises carry no UK relief, so they are measured against the unwrapped hurdle throughout.
          </p>
        </>
      )}
    </div>
  );
}
