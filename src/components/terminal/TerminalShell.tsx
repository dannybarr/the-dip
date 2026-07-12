import { type ReactNode, useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { TickerTape } from "./TickerTape";
import { VerDot } from "./VerDot";
import { FallbackNotice } from "./DataState";
import { useMarket } from "@/context/MarketProvider";
import { fmtPct } from "@/lib/fmt";
import { cn } from "@/lib/utils";
import { Menu, RefreshCw, Search } from "lucide-react";

const NAV = [
  { to: "/", label: "Dip Scanner", key: "F1" },
  { to: "/watchlist", label: "Watchlist", key: "F2" },
  { to: "/methodology", label: "Methodology", key: "F3" },
];

function TickerSearch() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { analyses } = useMarket();
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="row-hover flex items-center gap-2 rounded-sm border border-hairline bg-panel-2 px-3 py-1.5 text-xs text-muted-foreground"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Search ticker</span>
        <kbd className="micro rounded-sm border border-hairline px-1 py-px">⌘K</kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Ticker or company…" />
        <CommandList>
          <CommandEmpty>Not in coverage universe.</CommandEmpty>
          <CommandGroup heading="Coverage">
            {analyses.map((a) => (
              <CommandItem
                key={a.stock.ticker}
                value={`${a.stock.ticker} ${a.stock.name}`}
                onSelect={() => {
                  setOpen(false);
                  navigate(`/stock/${a.stock.ticker}`);
                }}
              >
                <VerDot verdict={a.verdict} />
                <span className="font-mono font-semibold">{a.stock.ticker}</span>
                <span className="ml-2 text-muted-foreground">{a.stock.name}</span>
                <span className="num ml-auto text-down">{fmtPct(a.stock.dipPctWeek)} wk</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}

export function TerminalShell({ children }: { children: ReactNode }) {
  const { data, isFetching, refresh } = useMarket();
  const indices = data?.indices ?? [];
  const isLive = data?.dataMode === "LIVE";
  const asOf = data?.asOf ?? "—";
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Index strip */}
      <div className="hidden items-center gap-5 overflow-x-auto border-b border-hairline bg-background px-4 py-1 md:flex">
        {indices.length > 0 &&
          indices.map((ix) => (
            <div key={ix.symbol} className="flex shrink-0 items-baseline gap-1.5">
              <span className="micro">{ix.symbol}</span>
              <span className="num text-xs text-foreground">{ix.value.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
              <span className={`num text-xs ${ix.changePct >= 0 ? (ix.symbol === "VIX" ? "text-warnhot" : "text-up") : "text-down"}`}>
                {fmtPct(ix.changePct)}
              </span>
            </div>
          ))}
        <div className="ml-auto flex shrink-0 items-center gap-2.5">
          <span className={cn("h-1.5 w-1.5 rounded-full", isLive ? "animate-blink bg-up" : "bg-gold")} />
          <span className={cn("micro", isLive ? "text-up" : "text-gold")}>{isLive ? "LIVE" : "SIMULATED"}</span>
          <span className="micro">{asOf}</span>
          <button
            onClick={refresh}
            disabled={isFetching}
            aria-label="Refresh market data"
            className="row-hover flex items-center gap-1 rounded-sm border border-hairline px-1.5 py-0.5 text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} />
          </button>
        </div>
      </div>

      {data?.dataMode === "SIMULATED" && data.fallbackReason && <FallbackNotice reason={data.fallbackReason} />}

      {/* Masthead */}
      <header className="flex items-center gap-6 border-b border-hairline bg-panel px-4 py-2.5">
        <Link to="/" className="flex items-center gap-2.5">
          <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
            <rect width="26" height="26" rx="4" fill="hsl(var(--gold))" />
            <path d="M4 6 L15 19 L22 8" fill="none" stroke="#0B0F14" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="leading-none">
            <div className="font-mono text-base font-bold tracking-tight text-foreground">THE DIP</div>
            <div className="micro mt-0.5 hidden sm:block">Institutional Dip Research</div>
          </div>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-sm px-3 py-1.5 font-mono text-xs font-medium uppercase tracking-wider transition-colors",
                  isActive ? "bg-panel-2 text-gold" : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              <span className="micro hidden lg:inline">{n.key}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <TickerSearch />
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <button
                aria-label="Open navigation menu"
                className="row-hover flex items-center rounded-sm border border-hairline p-1.5 text-muted-foreground hover:text-foreground md:hidden"
              >
                <Menu className="h-4 w-4" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 border-hairline bg-panel p-4">
              <nav className="mt-6 flex flex-col gap-1">
                {NAV.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.to === "/"}
                    onClick={() => setMobileNavOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2 rounded-sm px-3 py-2 font-mono text-xs font-medium uppercase tracking-wider transition-colors",
                        isActive ? "bg-panel-2 text-gold" : "text-muted-foreground hover:text-foreground",
                      )
                    }
                  >
                    <span className="micro">{n.key}</span>
                    {n.label}
                  </NavLink>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <TickerTape />

      <main className="flex-1">{children}</main>

      <footer className="border-t border-hairline bg-panel px-4 py-2">
        <p className="micro leading-relaxed normal-case tracking-normal">
          THE DIP RESEARCH DESK v1.0 · {isLive ? "Live market data" : "Simulated snapshot"} · {asOf} ·
          Quotes, technicals and fundamentals are {isLive ? "sourced live from Financial Modeling Prep" : "illustrative research fixtures"}; catalyst reads, moat and balance-sheet ratings and desk notes are analyst judgments.
          Nothing here is investment advice; verdicts are model output for your own judgment. Short-term trading involves substantial risk of loss.
        </p>
      </footer>
    </div>
  );
}
