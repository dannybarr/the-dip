import { useMemo, useState } from "react";
import { planDeployment } from "@/lib/angel/portfolio";
import { feesFor } from "@/lib/angel/returns";
import type { TaxWrapper } from "@/lib/angel/types";

const WRAPPERS: TaxWrapper[] = ["SEIS", "EIS", "NONE"];

export default function AngelPortfolio() {
  const [budget, setBudget] = useState(9000);
  const [ticket, setTicket] = useState(500);
  const [wrapper, setWrapper] = useState<TaxWrapper>("SEIS");
  const [years, setYears] = useState(8);

  const plan = useMemo(
    () => planDeployment(budget, ticket, { wrapper, horizonYears: years, fees: feesFor("crowdcube"), trials: 8000 }),
    [budget, ticket, wrapper, years],
  );

  const gbp = (n: number) => n.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
  const maxBeat = Math.max(...plan.curve.map((c) => c.pBeatIndex));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="micro text-gold">Angel Desk</div>
      <h1 className="mt-1 font-mono text-2xl font-bold uppercase tracking-tight text-foreground">Deployment</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        In an asset class where half of positions go to zero and the return comes from a 3% tail, the number of
        positions you hold matters more than the quality of any one of them. Five excellent deals will usually return
        less than thirty average ones, because five positions most likely contain no tail outcome at all. This is the
        one decision at this cheque size that is genuinely yours to make.
      </p>

      <div className="panel mt-6 flex flex-wrap items-end gap-6 p-4">
        <label className="flex flex-col gap-1">
          <span className="micro">Annual budget</span>
          <input type="number" min={500} step={500} value={budget} onChange={(e) => setBudget(Math.max(0, Number(e.target.value)))} className="num w-32 rounded-sm border border-hairline bg-panel-2 px-2 py-1.5 text-sm text-foreground" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="micro">Ticket size</span>
          <input type="number" min={50} step={50} value={ticket} onChange={(e) => setTicket(Math.max(1, Number(e.target.value)))} className="num w-28 rounded-sm border border-hairline bg-panel-2 px-2 py-1.5 text-sm text-foreground" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="micro">Wrapper</span>
          <select value={wrapper} onChange={(e) => setWrapper(e.target.value as TaxWrapper)} className="rounded-sm border border-hairline bg-panel-2 px-2 py-1.5 font-mono text-xs uppercase text-foreground">
            {WRAPPERS.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="micro">Horizon</span>
          <div className="flex items-center gap-2">
            <input type="range" min={3} max={12} value={years} onChange={(e) => setYears(Number(e.target.value))} className="w-28 accent-[hsl(var(--gold))]" />
            <span className="num w-12 text-sm text-foreground">{years}y</span>
          </div>
        </label>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="panel p-3">
          <div className="micro">Positions</div>
          <div className="num mt-1 text-2xl font-semibold text-foreground">{plan.positions}</div>
        </div>
        <div className="panel p-3">
          <div className="micro">Capital genuinely at risk</div>
          <div className="num mt-1 text-2xl font-semibold text-gold">{gbp(plan.capitalAtRisk)}</div>
        </div>
        <div className="panel p-3">
          <div className="micro">For even odds vs index</div>
          <div className="num mt-1 text-2xl font-semibold text-foreground">{plan.positionsForEvenOdds ?? "—"}</div>
        </div>
        <div className="panel p-3">
          <div className="micro">For controlled downside</div>
          <div className="num mt-1 text-2xl font-semibold text-foreground">{plan.positionsForDownsideControl ?? "—"}</div>
        </div>
      </div>

      {plan.notes.length > 0 && (
        <div className="panel mt-4 p-4">
          {plan.notes.map((n, i) => (
            <p key={i} className="text-sm leading-relaxed text-foreground first:mt-0 [&:not(:first-child)]:mt-2">{n}</p>
          ))}
        </div>
      )}

      <div className="panel mt-6 overflow-x-auto">
        <div className="panel-title px-4 pt-3">What position count buys you</div>
        <table className="mt-2 w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-hairline text-left">
              {["Positions", "Median", "Mean", "p10", "p90", "Beat index", "Below capital", "Holds a 10x+"].map((h) => (
                <th key={h} className="micro px-3 py-2 font-normal">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plan.curve.map((r) => {
              const isYours = r.nPositions === plan.positions;
              return (
                <tr key={r.nPositions} className={`row-hover border-b border-hairline/60 last:border-0 ${isYours ? "bg-panel-2" : ""}`}>
                  <td className="num px-3 py-2 font-semibold text-foreground">
                    {r.nPositions}{isYours && <span className="micro ml-2 text-gold">yours</span>}
                  </td>
                  <td className="num px-3 py-2 text-muted-foreground">{r.medianMultiple.toFixed(2)}x</td>
                  <td className="num px-3 py-2 text-muted-foreground">{r.meanMultiple.toFixed(2)}x</td>
                  <td className="num px-3 py-2 text-down">{r.p10Multiple.toFixed(2)}x</td>
                  <td className="num px-3 py-2 text-up">{r.p90Multiple.toFixed(2)}x</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 rounded-full bg-panel-2">
                        <div className="h-1.5 rounded-full bg-gold" style={{ width: `${(r.pBeatIndex / Math.max(maxBeat, 0.01)) * 100}%` }} />
                      </div>
                      <span className="num text-xs text-foreground">{(r.pBeatIndex * 100).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="num px-3 py-2 text-down">{(r.pBelowCapital * 100).toFixed(0)}%</td>
                  <td className="num px-3 py-2 text-muted-foreground">{(r.pAnyTail * 100).toFixed(0)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="px-4 pb-4 pt-3 text-xs leading-relaxed text-muted-foreground">
          Median below mean at every row is the power law showing through: the average is carried by outcomes most
          portfolios never hold. Equal weighting is assumed throughout, because at this cheque size there is no
          reliable way to size up a conviction bet and the evidence that anyone picks the tail winner in advance is
          weak. Simulated from the baseline distribution with the evidence tilt disabled, so no selection skill is
          assumed anywhere in these numbers.
        </p>
        <p className="px-4 pb-4 text-xs leading-relaxed text-muted-foreground">
          The beat-index column is not monotonic at two and three positions. That is real, not a simulation artefact:
          with seven discrete outcome buckets the average of a handful of draws lands on a lumpy set of values, and
          crossing the index threshold depends on which specific combinations are reachable. It smooths out from about
          eight positions. Presenting a tidier curve would mean inventing resolution the model does not have.
        </p>
      </div>
    </div>
  );
}
