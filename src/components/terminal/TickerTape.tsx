import { Link } from "react-router-dom";
import { useMarket } from "@/context/MarketProvider";
import { fmtPct, fmtPrice } from "@/lib/fmt";

/** Scrolling coverage tape under the header — every name links to its analysis. */
export function TickerTape() {
  const { analyses: items } = useMarket();
  if (items.length === 0) return null;
  const strip = (
    <div className="flex shrink-0 items-center">
      {items.map((a) => (
        <Link
          key={a.stock.ticker}
          to={`/stock/${a.stock.ticker}`}
          className="row-hover flex items-center gap-2 border-r border-hairline px-4 py-1.5"
        >
          <span className="font-mono text-xs font-semibold text-foreground">{a.stock.ticker}</span>
          <span className="num text-xs text-muted-foreground">{fmtPrice(a.stock.price)}</span>
          <span className={`num text-xs font-medium ${a.stock.dipPctDay < 0 ? "text-down" : "text-up"}`}>
            {fmtPct(a.stock.dipPctDay)}
          </span>
        </Link>
      ))}
    </div>
  );
  return (
    <div className="relative overflow-hidden border-b border-hairline bg-panel" aria-hidden="true">
      <div className="flex w-max animate-tape hover:[animation-play-state:paused]">
        {strip}
        {strip}
      </div>
    </div>
  );
}
