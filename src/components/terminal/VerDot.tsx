import type { Verdict } from "@/lib/types";
import { VERDICT_META } from "@/lib/types";

const TONE_BG: Record<string, string> = {
  buy: "bg-up",
  scale: "bg-up/70",
  hold: "bg-gold",
  warn: "bg-warnhot",
  sell: "bg-down",
};

/** Tiny verdict indicator dot. */
export function VerDot({ verdict }: { verdict: Verdict }) {
  return <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${TONE_BG[VERDICT_META[verdict].tone]}`} />;
}
