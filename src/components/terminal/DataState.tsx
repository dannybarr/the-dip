import { Loader2, WifiOff } from "lucide-react";

/** Full-view loading state while the desk pulls the live tape. */
export function LoadingView({ label = "Pulling live tape" }: { label?: string }) {
  return (
    <div className="container flex min-h-[60vh] flex-col items-center justify-center gap-3 py-16 text-center">
      <Loader2 className="h-6 w-6 animate-spin text-gold" />
      <div className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="text-[11px] text-muted-foreground/70">Fetching quotes, history and fundamentals across coverage</div>
    </div>
  );
}

/** Slim banner shown when the desk is running on the simulated fallback. */
export function FallbackNotice({ reason }: { reason: string }) {
  return (
    <div className="border-b border-warnhot/30 bg-warnhot/[0.06] px-4 py-1.5">
      <div className="container flex items-center gap-2">
        <WifiOff className="h-3.5 w-3.5 shrink-0 text-warnhot" />
        <p className="micro normal-case tracking-normal text-warnhot/90">
          Live feed unavailable ({reason}). Showing the simulated research snapshot: verdicts are illustrative until the feed returns.
        </p>
      </div>
    </div>
  );
}
