import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  DEFAULT_TAX,
  buildHurdleReport,
  feesFor,
  type TaxProfile,
} from "@/lib/angel/returns";
import { BASELINE_OUTCOMES } from "@/lib/angel/config";
import {
  expectedGrossMultiple,
  expectedNetMultiple,
  edgeVsIndex,
  withTailProbability,
} from "@/lib/angel/outcome";
import type { TaxWrapper } from "@/lib/angel/types";

const WRAPPERS: TaxWrapper[] = ["SEIS", "EIS", "NONE"];
const PLATFORMS = ["crowdcube", "seedrs", "wefunder", "startengine"] as const;

const WRAPPER_LABEL: Record<TaxWrapper, string> = {
  SEIS: "SEIS",
  EIS: "EIS",
  NONE: "No relief",
};

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" | "gold" }) {
  const colour = tone === "up" ? "text-up" : tone === "down" ? "text-down" : tone === "gold" ? "text-gold" : "text-foreground";
  return (
    <div className="panel p-3">
      <div className="micro">{label}</div>
      <div className={`num mt-1 text-xl font-semibold ${colour}`}>{value}</div>
    </div>
  );
}

export default function AngelHurdle() {
  const [years, setYears] = useState(8);
  const [platform, setPlatform] = useState<(typeof PLATFORMS)[number]>("crowdcube");
  const [illiquidity, setIlliquidity] = useState(0);
  const [hasLiability, setHasLiability] = useState(true);
  const [tailP, setTailP] = useState(0.01);
  /**
   * How much better than the index a locked-up, undiversifiable, eight-year
   * single position has to be before it is worth doing. Matching the index at
   * parity is not good enough: you are giving up liquidity, the ability to
   * rebalance, and any chance of exiting early. 1.25 demands 25% for that.
   */
  const [requiredEdge, setRequiredEdge] = useState(1.25);

  const tax: TaxProfile = { ...DEFAULT_TAX, sufficientLiability: hasLiability };
  const fees = feesFor(platform);

  const rows = useMemo(
    () => WRAPPERS.map((w) => ({ wrapper: w, report: buildHurdleReport(years, w, tax, fees, 0.1, illiquidity) })),
    [years, platform, illiquidity, hasLiability],
  );

  const sensitivity = useMemo(() => {
    const points = [0.02, 0.015, 0.012, 0.01, 0.008, 0.007, 0.005, 0.003, 0];
    return points.map((p) => {
      const buckets = withTailProbability(p);
      const gross = expectedGrossMultiple(buckets);
      const net = expectedNetMultiple(buckets, "SEIS", tax, fees);
      const edge = edgeVsIndex(net, years, 0.1, illiquidity);
      return { p, gross, net, edge };
    });
  }, [years, platform, illiquidity, hasLiability]);

  const current = sensitivity.find((s) => Math.abs(s.p - tailP) < 1e-9) ?? sensitivity[3];
  const beats = current.edge >= requiredEdge;
  // Where the answer changes, computed rather than asserted, so the copy below
  // can never drift out of step with the table above it.
  const flipAt = sensitivity.find((s) => s.edge < requiredEdge);
  const lastPassing = [...sensitivity].reverse().find((s) => s.edge >= requiredEdge);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="micro text-gold">Angel Desk</div>
      <h1 className="mt-1 font-mono text-2xl font-bold uppercase tracking-tight text-foreground">The Hurdle</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        Before asking whether a company is good, ask what it has to return for you to have been right to buy it
        instead of an index tracker. For a UK retail investor that answer is set almost entirely by the tax wrapper,
        not by anything you can learn about the business.
      </p>

      {/* Controls */}
      <div className="panel mt-6 flex flex-wrap items-end gap-5 p-4">
        <label className="flex flex-col gap-1">
          <span className="micro">Horizon</span>
          <div className="flex items-center gap-2">
            <input type="range" min={3} max={12} step={1} value={years} onChange={(e) => setYears(Number(e.target.value))} className="w-32 accent-[hsl(var(--gold))]" />
            <span className="num w-14 text-sm text-foreground">{years} yrs</span>
          </div>
        </label>

        <label className="flex flex-col gap-1">
          <span className="micro">Platform fees</span>
          <select value={platform} onChange={(e) => setPlatform(e.target.value as (typeof PLATFORMS)[number])} className="rounded-sm border border-hairline bg-panel-2 px-2 py-1.5 font-mono text-xs uppercase text-foreground">
            {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="micro">Illiquidity premium</span>
          <div className="flex items-center gap-2">
            <input type="range" min={0} max={0.06} step={0.01} value={illiquidity} onChange={(e) => setIlliquidity(Number(e.target.value))} className="w-28 accent-[hsl(var(--gold))]" />
            <span className="num w-12 text-sm text-foreground">{(illiquidity * 100).toFixed(0)}%</span>
          </div>
        </label>

        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={hasLiability} onChange={(e) => setHasLiability(e.target.checked)} className="accent-[hsl(var(--gold))]" />
          <span className="micro normal-case">Sufficient income tax liability to absorb relief</span>
        </label>
      </div>

      {/* Hurdle table */}
      <div className="panel mt-4 overflow-x-auto">
        <div className="panel-title px-4 pt-3">What a deal must return</div>
        <table className="mt-2 w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-hairline text-left">
              {["Wrapper", "At risk", "Break even", "Beat the index", "If total loss"].map((h) => (
                <th key={h} className="micro px-4 py-2 font-normal">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ wrapper, report }) => (
              <tr key={wrapper} className="row-hover border-b border-hairline/60 last:border-0">
                <td className="px-4 py-2.5 font-mono text-xs font-semibold uppercase text-foreground">{WRAPPER_LABEL[wrapper]}</td>
                <td className="num px-4 py-2.5 text-foreground">{(report.netCostFraction * 100).toFixed(0)}%</td>
                <td className="num px-4 py-2.5 text-muted-foreground">{report.breakevenMultiple.toFixed(2)}x</td>
                <td className="num px-4 py-2.5 font-semibold text-gold">{report.hurdleMultiple.toFixed(2)}x</td>
                <td className={`num px-4 py-2.5 ${report.downsideNetMultiple > 0 ? "text-warnhot" : "text-down"}`}>
                  {report.downsideNetMultiple.toFixed(2)}x
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-4 pb-3 pt-3 text-xs leading-relaxed text-muted-foreground">
          Read the gap between the first and last rows. Relief does not improve the company, it halves the distance
          the company has to travel. That is why an unwrapped UK raise is rejected outright by this desk: no retail
          selection skill is worth a 2x handicap.
        </p>
      </div>

      {/* Sensitivity: the honest centre of the whole model */}
      <div className="panel mt-6">
        <div className="panel-title px-4 pt-3">The assumption everything rests on</div>
        <div className="px-4 pb-4 pt-2">
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            The expected value of this asset class is a power law: roughly a quarter of it sits in a single outcome
            bucket, a 1% chance of a 30x. That 1% is a hand-written number anchored on published stylised facts, not a
            fitted distribution. It is the most load-bearing assumption in the desk, so rather than bury it in a config
            file, move it and watch the conclusion change.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-8">
            <label className="flex flex-col gap-1">
              <span className="micro">Edge you demand over the index</span>
              <div className="flex items-center gap-3">
                <input type="range" min={1} max={2} step={0.05} value={requiredEdge} onChange={(e) => setRequiredEdge(Number(e.target.value))} className="w-40 accent-[hsl(var(--gold))]" />
                <span className="num w-14 text-lg font-semibold text-foreground">{requiredEdge.toFixed(2)}x</span>
              </div>
              <span className="text-xs leading-relaxed text-muted-foreground">Payment for eight years of illiquidity and single-name risk. At 1.00x you are accepting index returns for venture risk.</span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="micro">Probability of a 30x outcome</span>
              <div className="flex items-center gap-3">
                <input
                  type="range" min={0} max={8} step={1}
                  value={[0, 0.003, 0.005, 0.007, 0.008, 0.01, 0.012, 0.015, 0.02].indexOf(tailP) === -1 ? 5 : [0, 0.003, 0.005, 0.007, 0.008, 0.01, 0.012, 0.015, 0.02].indexOf(tailP)}
                  onChange={(e) => setTailP([0, 0.003, 0.005, 0.007, 0.008, 0.01, 0.012, 0.015, 0.02][Number(e.target.value)])}
                  className="w-56 accent-[hsl(var(--gold))]"
                />
                <span className="num w-16 text-lg font-semibold text-gold">{(tailP * 100).toFixed(1)}%</span>
              </div>
            </label>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Stat label="Expected gross multiple" value={`${current.gross.toFixed(3)}x`} />
            <Stat label="Expected net, money at risk (SEIS)" value={`${current.net.toFixed(3)}x`} />
            <Stat label={`Versus the index over ${years} years`} value={`${current.edge.toFixed(3)}x`} tone={beats ? "up" : "down"} />
          </div>

          <div className={`mt-4 rounded-sm border px-4 py-3 text-sm leading-relaxed ${beats ? "border-up/40 bg-up/5 text-foreground" : "border-down/40 bg-down/5 text-foreground"}`}>
            {beats ? (
              <>At a {(tailP * 100).toFixed(1)}% tail probability, wrapped crowdfunding beats the index in expectation by {((current.edge - 1) * 100).toFixed(0)}%, which clears the {requiredEdge.toFixed(2)}x you are demanding. That conclusion is the model's, not a fact about the world.</>
            ) : (
              <>At a {(tailP * 100).toFixed(1)}% tail probability the expected edge is {current.edge.toFixed(2)}x, short of the {requiredEdge.toFixed(2)}x you are demanding for eight years of illiquidity. Nothing about deal selection changes this: it is arithmetic about the tail.</>
            )}
          </div>

          <table className="mt-5 w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                {["p(30x)", "E[gross]", "E[net] at risk", "vs index", ""].map((h) => (
                  <th key={h} className="micro px-3 py-2 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sensitivity.map((s) => {
                const win = s.edge >= requiredEdge;
                const isCurrent = Math.abs(s.p - tailP) < 1e-9;
                return (
                  <tr key={s.p} className={`row-hover border-b border-hairline/60 last:border-0 ${isCurrent ? "bg-panel-2" : ""}`}>
                    <td className="num px-3 py-2 text-foreground">{(s.p * 100).toFixed(1)}%</td>
                    <td className="num px-3 py-2 text-muted-foreground">{s.gross.toFixed(3)}x</td>
                    <td className="num px-3 py-2 text-muted-foreground">{s.net.toFixed(3)}x</td>
                    <td className={`num px-3 py-2 font-semibold ${win ? "text-up" : "text-down"}`}>{s.edge.toFixed(3)}x</td>
                    <td className="px-3 py-2">
                      <span className={`micro ${win ? "text-up" : "text-down"}`}>{win ? "worth doing" : s.edge >= 1 ? "beats index, not the bar" : "loses to index"}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <p className="mt-4 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            {lastPassing && flipAt ? (
              <>
                At a {requiredEdge.toFixed(2)}x bar the answer flips between {(lastPassing.p * 100).toFixed(1)}% and{" "}
                {(flipAt.p * 100).toFixed(1)}%. A fraction of a percentage point, chosen by hand, decides whether this
                entire asset class is worth touching.{" "}
              </>
            ) : flipAt ? (
              <>At a {requiredEdge.toFixed(2)}x bar nothing in this range clears it, so the asset class fails on its own arithmetic before any deal is examined. </>
            ) : (
              <>At a {requiredEdge.toFixed(2)}x bar every tail probability in this range clears it, which tells you the bar is doing no work. Raise it until it does. </>
            )}
            Any tool that shows you a single confident answer here is hiding this from you. Missing tail probability is
            reassigned to total loss rather than to the middle buckets, which is the conservative choice.
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/angel/deals" className="rounded-sm border border-gold/50 bg-gold/10 px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-gold">
          Find live raises
        </Link>
        <Link to="/angel/portfolio" className="rounded-sm border border-hairline px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
          Plan a deployment
        </Link>
      </div>
    </div>
  );
}
