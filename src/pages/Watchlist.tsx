import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getAnalysis } from "@/lib/engine/market";
import { fmtPct, fmtPrice } from "@/lib/fmt";
import { useWatchlist, watchlistStore } from "@/lib/watchlist";
import { VerdictBadge } from "@/components/terminal/VerdictBadge";
import { ScoreBar } from "@/components/terminal/ScoreMeter";
import { Sparkline } from "@/components/terminal/Sparkline";
import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";

function EntryCell({ ticker, entryPrice, sizePct }: { ticker: string; entryPrice?: number; sizePct?: number }) {
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(entryPrice?.toString() ?? "");
  const [size, setSize] = useState(sizePct?.toString() ?? "2");

  if (!editing && entryPrice == null) {
    return (
      <button onClick={() => setEditing(true)} className="micro rounded-sm border border-hairline px-2 py-1 hover:text-foreground">
        Log entry
      </button>
    );
  }
  if (!editing && entryPrice != null) {
    return (
      <button onClick={() => setEditing(true)} className="num text-xs text-foreground underline-offset-2 hover:underline">
        ${fmtPrice(entryPrice)} · {sizePct}%
      </button>
    );
  }
  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        const p = parseFloat(price);
        const s = parseFloat(size);
        if (Number.isFinite(p) && p > 0 && Number.isFinite(s) && s > 0) {
          watchlistStore.markEntered(ticker, p, s);
          setEditing(false);
        }
      }}
    >
      <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Entry $" className="num w-20 rounded-sm border border-hairline bg-panel-2 px-1.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gold" />
      <input value={size} onChange={(e) => setSize(e.target.value)} placeholder="%" className="num w-12 rounded-sm border border-hairline bg-panel-2 px-1.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gold" />
      <button type="submit" className="micro rounded-sm border border-gold/50 bg-gold/10 px-2 py-1 text-gold">OK</button>
    </form>
  );
}

export default function Watchlist() {
  const navigate = useNavigate();
  const positions = useWatchlist();
  const rows = positions
    .map((p) => ({ pos: p, analysis: getAnalysis(p.ticker) }))
    .filter((r) => r.analysis);

  const entered = rows.filter((r) => r.pos.entryPrice != null);
  const totalPnlPct =
    entered.length > 0
      ? entered.reduce((sum, r) => sum + ((r.analysis!.stock.price / r.pos.entryPrice! - 1) * 100) * (r.pos.sizePct ?? 0), 0) /
        Math.max(entered.reduce((s, r) => s + (r.pos.sizePct ?? 0), 0), 1)
      : 0;

  return (
    <div className="container max-w-[1480px] space-y-4 py-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-mono text-xl font-bold uppercase tracking-wide text-foreground">Watchlist & Positions</h1>
          <p className="mt-1 text-xs text-muted-foreground">Names you're stalking, and entries you've logged against the desk's trade plans.</p>
        </div>
        {entered.length > 0 && (
          <div className="panel px-4 py-2 text-right">
            <div className="micro">Weighted Open P&L</div>
            <div className={cn("num text-xl font-bold", totalPnlPct >= 0 ? "text-up" : "text-down")}>{fmtPct(totalPnlPct)}</div>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="panel flex flex-col items-center gap-3 px-6 py-16 text-center">
          <div className="font-mono text-sm font-semibold uppercase tracking-wider text-foreground">Nothing under watch</div>
          <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
            Add names from the scanner or an analysis page. The desk tracks the verdict, plan levels, and your logged entries here.
          </p>
          <Link to="/" className="mt-2 rounded-sm border border-gold/50 bg-gold/10 px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-gold">
            Open Dip Scanner
          </Link>
        </div>
      ) : (
        <section className="panel overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-hairline">
                {["Ticker", "Last", "1D", "1W", "Trend", "Score", "Verdict", "Entry / Size", "Open P&L", "Stop", "Target 1", ""].map((h) => (
                  <th key={h} className="micro whitespace-nowrap px-3 py-2 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ pos, analysis }) => {
                const a = analysis!;
                const pnl = pos.entryPrice != null ? (a.stock.price / pos.entryPrice - 1) * 100 : null;
                return (
                  <tr key={pos.ticker} className="row-hover border-b border-hairline/60 last:border-0">
                    <td onClick={() => navigate(`/stock/${a.stock.ticker}`)} className="cursor-pointer px-3 py-2.5">
                      <div className="font-mono text-sm font-bold text-foreground">{a.stock.ticker}</div>
                      <div className="text-[11px] text-muted-foreground">{a.stock.name}</div>
                    </td>
                    <td className="num px-3 py-2.5 text-foreground">${fmtPrice(a.stock.price)}</td>
                    <td className={cn("num px-3 py-2.5", a.stock.dipPctDay < 0 ? "text-down" : "text-up")}>{fmtPct(a.stock.dipPctDay)}</td>
                    <td className={cn("num px-3 py-2.5", a.stock.dipPctWeek < 0 ? "text-down" : "text-up")}>{fmtPct(a.stock.dipPctWeek)}</td>
                    <td className="px-3 py-1.5"><Sparkline series={a.series} width={72} height={22} points={40} /></td>
                    <td className="px-3 py-2.5"><ScoreBar score={a.dipScore} /></td>
                    <td className="px-3 py-2.5"><VerdictBadge verdict={a.verdict} /></td>
                    <td className="px-3 py-2.5"><EntryCell ticker={pos.ticker} entryPrice={pos.entryPrice} sizePct={pos.sizePct} /></td>
                    <td className={cn("num px-3 py-2.5 font-semibold", pnl == null ? "text-muted-foreground" : pnl >= 0 ? "text-up" : "text-down")}>
                      {pnl == null ? "—" : fmtPct(pnl)}
                    </td>
                    {a.verdict === "FALLING_KNIFE" || a.verdict === "AVOID" ? (
                      <td colSpan={2} className="micro px-3 py-2.5 normal-case tracking-normal">No levels published</td>
                    ) : (
                      <>
                        <td className="num px-3 py-2.5 text-down">${fmtPrice(a.plan.stop)}</td>
                        <td className="num px-3 py-2.5 text-up">${fmtPrice(a.plan.target1)}</td>
                      </>
                    )}
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => watchlistStore.toggle(pos.ticker)}
                        aria-label={`Remove ${pos.ticker}`}
                        className="text-muted-foreground transition-colors hover:text-down"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
