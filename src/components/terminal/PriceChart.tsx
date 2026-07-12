import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { CHART } from "./chartTheme";
import type { Analysis } from "@/lib/types";
import { fmtPrice } from "@/lib/fmt";

interface Props {
  analysis: Analysis;
  /** trading days to display */
  window?: number;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="panel px-3 py-2 shadow-lg">
      <div className="micro">{label}</div>
      <div className="num mt-0.5 text-sm font-semibold text-foreground">${fmtPrice(payload[0].value)}</div>
    </div>
  );
}

/** One-year price tape with the trade plan levels drawn on the right edge. */
export function PriceChart({ analysis, window: win = 252 }: Props) {
  const { series, plan, technicals, stock, verdict, isDip } = analysis;
  const data = series.slice(-win);
  const dipping = stock.dipPctWeek < 0;
  const lineColor = dipping ? CHART.down : CHART.up;
  // Plan levels are only meaningful for a genuine, tradeable dip.
  const showPlan = isDip && verdict !== "FALLING_KNIFE" && verdict !== "AVOID";

  const lows = data.map((p) => p.c);
  const yMin = Math.min(...lows, showPlan ? plan.stop : Infinity) * 0.97;
  const yMax = Math.max(...lows, showPlan ? plan.target2 : -Infinity) * 1.03;
  const fmtLevel = (v: number) => (yMax < 25 ? v.toFixed(2) : yMax < 100 ? v.toFixed(1) : v.toFixed(0));

  const refLabel = (text: string, color: string) => ({
    value: text,
    position: "right" as const,
    fill: color,
    fontSize: 10,
    fontFamily: "IBM Plex Mono, monospace",
  });

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 64, bottom: 4, left: 0 }}>
        <defs>
          <linearGradient id={`fill-${stock.ticker}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity={0.16} />
            <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={CHART.grid} strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="d"
          tick={{ fill: CHART.text, fontSize: 10, fontFamily: "IBM Plex Mono" }}
          tickFormatter={(d: string) => d.slice(5, 7) + "/" + d.slice(2, 4)}
          minTickGap={60}
          axisLine={{ stroke: CHART.grid }}
          tickLine={false}
        />
        <YAxis
          domain={[yMin, yMax]}
          orientation="left"
          width={56}
          tick={{ fill: CHART.text, fontSize: 10, fontFamily: "IBM Plex Mono" }}
          tickFormatter={fmtLevel}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: CHART.axis, strokeDasharray: "3 3" }} />

        {showPlan && (
          <ReferenceLine y={plan.target2} stroke={CHART.up} strokeDasharray="4 4" strokeOpacity={0.7} label={refLabel(`T2 ${fmtLevel(plan.target2)}`, CHART.up)} />
        )}
        {showPlan && plan.target2 - plan.target1 > (yMax - yMin) * 0.02 && (
          <ReferenceLine y={plan.target1} stroke={CHART.up} strokeDasharray="4 4" strokeOpacity={0.5} label={refLabel(`T1 ${fmtLevel(plan.target1)}`, CHART.up)} />
        )}
        {technicals.supportDefined && (
          <ReferenceLine y={technicals.supportLevel} stroke={CHART.cyan} strokeDasharray="4 4" strokeOpacity={0.7} label={refLabel(`SUP ${fmtLevel(technicals.supportLevel)}`, CHART.cyan)} />
        )}
        {showPlan && (
          <ReferenceLine y={plan.stop} stroke={CHART.down} strokeDasharray="4 4" strokeOpacity={0.8} label={refLabel(`STOP ${fmtLevel(plan.stop)}`, CHART.down)} />
        )}

        <Area type="monotone" dataKey="c" stroke="none" fill={`url(#fill-${stock.ticker})`} isAnimationActive={false} />
        <Line type="monotone" dataKey="c" stroke={lineColor} strokeWidth={1.6} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
