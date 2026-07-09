import { PILLAR_META, type PillarScore } from "@/lib/types";
import { scoreColor } from "./ScoreMeter";

/** Weighted pillar breakdown — the visible reasoning of the engine. */
export function PillarBars({ pillars, detailed = false }: { pillars: PillarScore[]; detailed?: boolean }) {
  return (
    <div className="flex flex-col divide-y divide-hairline">
      {pillars.map((p) => {
        const meta = PILLAR_META[p.key];
        const color = scoreColor(p.score);
        return (
          <div key={p.key} className="px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-semibold text-foreground">{meta.label}</span>
                <span className="micro">{(meta.weight * 100).toFixed(0)}%</span>
              </div>
              <span className="num text-sm font-bold" style={{ color }}>{p.score}</span>
            </div>
            <div className="mt-1.5 h-[5px] overflow-hidden rounded-full bg-panel-2">
              <div className="h-full rounded-full" style={{ width: `${p.score}%`, background: color }} />
            </div>
            {detailed && <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{p.note}</p>}
          </div>
        );
      })}
    </div>
  );
}
