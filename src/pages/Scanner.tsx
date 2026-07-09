import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getAnalyses, marketBreadth, VERDICT_ORDER } from "@/lib/engine/market";
import { VERDICT_META, type Verdict } from "@/lib/types";
import { fmtCap, fmtPct, fmtPrice } from "@/lib/fmt";
import { VerdictBadge } from "@/components/terminal/VerdictBadge";
import { ScoreBar } from "@/components/terminal/ScoreMeter";
import { Sparkline } from "@/components/terminal/Sparkline";
import { VerDot } from "@/components/terminal/VerDot";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUpDown } from "lucide-react";

type SortKey = "score" | "day" | "week" | "cap";
type Timeframe = "day" | "week";

function StatTile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "up" | "down" | "gold" }) {
  return (
    <div className="panel flex-1 px-4 py-3">
      <div className="micro">{label}</div>
      <div className={cn("num mt-1 text-2xl font-bold", tone === "up" && "text-up", tone === "down" && "text-down", tone === "gold" && "text-gold")}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export default function Scanner() {
  const navigate = useNavigate();
  const all = getAnalyses();
  const breadth = marketBreadth();

  const [timeframe, setTimeframe] = useState<Timeframe>("day");
  const [verdictFilter, setVerdictFilter] = useState<Verdict | "ALL">("ALL");
  const [sector, setSector] = useState<string>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("score");

  const sectors = useMemo(() => ["ALL", ...Array.from(new Set(all.map((a) => a.stock.sector))).sort()], [all]);

  const rows = useMemo(() => {
    let r = all;
    if (verdictFilter !== "ALL") r = r.filter((a) => a.verdict === verdictFilter);
    if (sector !== "ALL") r = r.filter((a) => a.stock.sector === sector);
    const sorters: Record<SortKey, (x: typeof r[number]) => number> = {
      score: (x) => -x.dipScore,
      day: (x) => x.stock.dipPctDay,
      week: (x) => x.stock.dipPctWeek,
      cap: (x) => -x.stock.marketCapB,
    };
    return [...r].sort((a, b) => sorters[sortKey](a) - sorters[sortKey](b));
  }, [all, verdictFilter, sector, sortKey]);

  const topConviction = all.filter((a) => a.verdict === "BUY_THE_DIP").slice(0, 3);
  const knives = all.filter((a) => a.verdict === "FALLING_KNIFE" || a.verdict === "AVOID").slice(0, 4);

  const Th = ({ children, k, className }: { children: React.ReactNode; k?: SortKey; className?: string }) => (
    <th
      className={cn("micro whitespace-nowrap px-3 py-2 text-left", k && "cursor-pointer select-none hover:text-foreground", className)}
      onClick={k ? () => setSortKey(k) : undefined}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {k && (sortKey === k ? <ArrowDown className="h-3 w-3 text-gold" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />)}
      </span>
    </th>
  );

  return (
    <div className="container max-w-[1480px] space-y-4 py-4">
      {/* Breadth strip */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <StatTile label="Coverage · Dips Under Review" value={String(breadth.covered)} sub="Names down on the day or week" />
        <StatTile label="Actionable Verdicts" value={String(breadth.buyable)} sub="Buy the Dip + Accumulate" tone="up" />
        <StatTile label="Avg Dip Score" value={String(breadth.avgScore)} sub="Composite across coverage" tone="gold" />
        <StatTile label="Avg Weekly Drawdown" value={fmtPct(breadth.avgDip)} sub="Coverage-weighted move" tone="down" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {/* Highest conviction */}
          <section className="panel">
            <div className="panel-title">
              <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-foreground">Desk Highest Conviction</h2>
              <span className="micro ml-auto">Ranked by Dip Score</span>
            </div>
            <div className="grid divide-y divide-hairline md:grid-cols-3 md:divide-x md:divide-y-0">
              {topConviction.map((a) => (
                <Link key={a.stock.ticker} to={`/stock/${a.stock.ticker}`} className="row-hover block p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-mono text-lg font-bold text-foreground">{a.stock.ticker}</div>
                      <div className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{a.stock.name}</div>
                    </div>
                    <Sparkline series={a.series} width={84} height={30} />
                  </div>
                  <div className="num mt-3 flex items-baseline gap-2">
                    <span className="text-base font-semibold text-foreground">${fmtPrice(a.stock.price)}</span>
                    <span className="text-xs font-medium text-down">{fmtPct(a.stock.dipPctWeek)} wk</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <VerdictBadge verdict={a.verdict} />
                    <ScoreBar score={a.dipScore} />
                  </div>
                  <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{a.stock.deskNote}</p>
                </Link>
              ))}
            </div>
          </section>

          {/* Scanner table */}
          <section className="panel">
            <div className="panel-title flex-wrap gap-y-2">
              <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-foreground">Dip Scanner</h2>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <div className="flex overflow-hidden rounded-sm border border-hairline">
                  {(["day", "week"] as Timeframe[]).map((tf) => (
                    <button
                      key={tf}
                      onClick={() => {
                        setTimeframe(tf);
                        setSortKey(tf);
                      }}
                      className={cn(
                        "px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider",
                        timeframe === tf ? "bg-gold text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {tf === "day" ? "Today" : "This Week"}
                    </button>
                  ))}
                </div>
                <select
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                  className="rounded-sm border border-hairline bg-panel-2 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground focus:outline-none"
                >
                  {sectors.map((s) => (
                    <option key={s} value={s}>{s === "ALL" ? "All sectors" : s}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Verdict filter chips */}
            <div className="flex flex-wrap items-center gap-1.5 border-b border-hairline px-3 py-2">
              <button
                onClick={() => setVerdictFilter("ALL")}
                className={cn(
                  "rounded-sm border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider",
                  verdictFilter === "ALL" ? "border-gold/60 bg-gold/10 text-gold" : "border-hairline text-muted-foreground hover:text-foreground",
                )}
              >
                All ({all.length})
              </button>
              {VERDICT_ORDER.map((v) => {
                const count = all.filter((a) => a.verdict === v).length;
                return (
                  <button
                    key={v}
                    onClick={() => setVerdictFilter(verdictFilter === v ? "ALL" : v)}
                    className={cn(
                      "flex items-center rounded-sm border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider",
                      verdictFilter === v ? "border-gold/60 bg-gold/10 text-foreground" : "border-hairline text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <VerDot verdict={v} />
                    {VERDICT_META[v].label} ({count})
                  </button>
                );
              })}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-sm">
                <thead>
                  <tr className="border-b border-hairline">
                    <Th>Ticker</Th>
                    <Th className="w-full">Company / Catalyst</Th>
                    <Th>Last</Th>
                    <Th k="day">1D</Th>
                    <Th k="week">1W</Th>
                    <Th k="cap">Mkt Cap</Th>
                    <Th>RSI</Th>
                    <Th>Vol</Th>
                    <Th>Trend</Th>
                    <Th k="score">Score</Th>
                    <Th>Verdict</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr
                      key={a.stock.ticker}
                      onClick={() => navigate(`/stock/${a.stock.ticker}`)}
                      className="row-hover cursor-pointer border-b border-hairline/60 last:border-0"
                    >
                      <td className="px-3 py-2.5 font-mono text-sm font-bold text-foreground">{a.stock.ticker}</td>
                      <td className="px-3 py-2.5">
                        <div className="text-xs font-medium text-foreground">{a.stock.name}</div>
                        <div className="mt-0.5 line-clamp-1 max-w-md text-[11px] text-muted-foreground">{a.stock.catalyst.headline}</div>
                      </td>
                      <td className="num px-3 py-2.5 text-foreground">{fmtPrice(a.stock.price)}</td>
                      <td className={cn("num px-3 py-2.5 font-medium", a.stock.dipPctDay < 0 ? "text-down" : "text-up")}>{fmtPct(a.stock.dipPctDay)}</td>
                      <td className={cn("num px-3 py-2.5 font-medium", a.stock.dipPctWeek < 0 ? "text-down" : "text-up")}>{fmtPct(a.stock.dipPctWeek)}</td>
                      <td className="num px-3 py-2.5 text-muted-foreground">{fmtCap(a.stock.marketCapB)}</td>
                      <td className={cn("num px-3 py-2.5", a.technicals.rsi14 < 30 ? "text-gold" : "text-muted-foreground")}>{a.technicals.rsi14.toFixed(0)}</td>
                      <td className={cn("num px-3 py-2.5", a.stock.volumeRatio >= 2.5 ? "text-gold" : "text-muted-foreground")}>{a.stock.volumeRatio.toFixed(1)}x</td>
                      <td className="px-3 py-1.5">
                        <Sparkline series={a.series} width={72} height={22} points={40} />
                      </td>
                      <td className="px-3 py-2.5"><ScoreBar score={a.dipScore} /></td>
                      <td className="px-3 py-2.5"><VerdictBadge verdict={a.verdict} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Side rail */}
        <aside className="space-y-4">
          <section className="panel">
            <div className="panel-title">
              <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-foreground">Do Not Catch</h2>
            </div>
            <div className="divide-y divide-hairline">
              {knives.map((a) => (
                <Link key={a.stock.ticker} to={`/stock/${a.stock.ticker}`} className="row-hover block px-3 py-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-bold text-foreground">{a.stock.ticker}</span>
                    <VerdictBadge verdict={a.verdict} />
                  </div>
                  <div className="num mt-1 text-xs text-down">{fmtPct(a.stock.dipPctWeek)} wk · score {a.dipScore}</div>
                  <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{a.stock.deskNote}</p>
                </Link>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-title">
              <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-foreground">Desk Doctrine</h2>
            </div>
            <div className="space-y-3 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              <p><span className="font-semibold text-gold">01</span> — Price falling is information, not opportunity. The catalyst decides which.</p>
              <p><span className="font-semibold text-gold">02</span> — We buy transient problems in permanent businesses. Never the reverse.</p>
              <p><span className="font-semibold text-gold">03</span> — Capitulation volume marks transfers from weak hands to strong. Be the strong hands.</p>
              <p><span className="font-semibold text-gold">04</span> — Every entry has a stop, a target, and a size before it has a fill.</p>
              <p>
                <Link to="/methodology" className="text-gold underline-offset-2 hover:underline">Full methodology →</Link>
              </p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
