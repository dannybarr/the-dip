import { CHART } from "./chartTheme";
import type { PricePoint } from "@/lib/types";

interface Props {
  series: PricePoint[];
  width?: number;
  height?: number;
  /** how many trailing points to draw */
  points?: number;
}

/** Minimal inline price sparkline; color follows period direction. */
export function Sparkline({ series, width = 96, height = 28, points = 60 }: Props) {
  const data = series.slice(-points).map((p) => p.c);
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const stepX = width / (data.length - 1);
  const y = (v: number) => height - 2 - ((v - min) / span) * (height - 4);
  const d = data.map((v, i) => `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const color = data[data.length - 1] >= data[0] ? CHART.up : CHART.down;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
