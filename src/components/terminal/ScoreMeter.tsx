import { cn } from "@/lib/utils";

export function scoreColor(score: number): string {
  if (score >= 72) return "hsl(var(--up))";
  if (score >= 60) return "hsl(158 45% 40%)";
  if (score >= 46) return "hsl(var(--gold))";
  if (score >= 32) return "hsl(var(--warnhot))";
  return "hsl(var(--down))";
}

/** Compact score readout used in tables: number + thin bar. */
export function ScoreBar({ score, className }: { score: number; className?: string }) {
  const color = scoreColor(score);
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="num w-7 text-right text-sm font-semibold" style={{ color }}>
        {score}
      </span>
      <div className="h-1 w-14 overflow-hidden rounded-full bg-panel-2">
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: color }} />
      </div>
    </div>
  );
}

/** Large radial gauge for the analysis header. */
export function ScoreDial({ score, size = 128, label = "Dip Score" }: { score: number; size?: number; label?: string }) {
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const arc = c * 0.75;
  const filled = arc * (score / 100);
  const color = scoreColor(score);
  return (
    <div className="relative" style={{ width: size, height: size }} role="img" aria-label={`${label} ${score} out of 100`}>
      <svg width={size} height={size} style={{ transform: "rotate(135deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--panel-2))" strokeWidth={stroke} strokeDasharray={`${arc} ${c}`} strokeLinecap="round" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={`${filled} ${c}`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="num text-4xl font-bold leading-none" style={{ color }}>{score}</span>
        <span className="micro mt-1">{label}</span>
      </div>
    </div>
  );
}
