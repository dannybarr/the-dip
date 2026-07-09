import { cn } from "@/lib/utils";
import type { Verdict } from "@/lib/types";
import { VERDICT_META } from "@/lib/types";

const TONE_CLASSES: Record<string, string> = {
  buy: "text-up border-up/50 bg-up/10",
  scale: "text-up/90 border-up/30 bg-up/5",
  hold: "text-gold border-gold/40 bg-gold/10",
  warn: "text-warnhot border-warnhot/40 bg-warnhot/10",
  sell: "text-down border-down/40 bg-down/10",
};

export function VerdictBadge({ verdict, size = "sm" }: { verdict: Verdict; size?: "sm" | "lg" }) {
  const meta = VERDICT_META[verdict];
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-sm border font-mono font-semibold uppercase",
        size === "sm" ? "px-1.5 py-0.5 text-[10px] tracking-[0.1em]" : "px-3 py-1 text-sm tracking-[0.14em]",
        TONE_CLASSES[meta.tone],
      )}
    >
      {meta.label}
    </span>
  );
}
