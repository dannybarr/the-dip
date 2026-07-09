import { type ReactNode, useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { TickerTape } from "./TickerTape";
import { VerDot } from "./VerDot";
import { getAnalyses, MARKET_INDICES, SNAPSHOT_LABEL, DATA_MODE } from "@/lib/engine/market";
import { fmtPct } from "@/lib/fmt";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";

const NAV = [
  { to: "/", label: "Dip Scanner", key: "F1" },
  { to: "/watchlist", label: "Watchlist", key: "F2" },
  { to: "/methodology", label: "Methodology", key: "F3" },
];

function TickerSearch() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
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
            {getAnalyses().map((a) => (
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
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Index strip */}
      <div className="hidden items-center gap-5 overflow-x-auto border-b border-hairline bg-background px-4 py-1 md:flex">
        {MARKET_INDICES.map((ix) => (
          <div key={ix.symbol} className="flex shrink-0 items-baseline gap-1.5">
            <span className="micro">{ix.symbol}</span>
            <span className="num text-xs text-foreground">{ix.value.toLocaleString("en-US")}</span>
            <span className={`num text-xs ${ix.changePct >= 0 ? (ix.symbol === "VIX" ? "text-warnhot" : "text-up") : "text-down"}`}>
              {fmtPct(ix.changePct)}
            </span>
          </div>
        ))}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <span className="h-1.5 w-1.5 animate-blink rounded-full bg-gold" />
          <span className="micro text-gold">{DATA_MODE}</span>
          <span className="micro">{SNAPSHOT_LABEL}</span>
        </div>
      </div>

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
        <nav className="flex items-center gap-1">
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
        <div className="ml-auto">
          <TickerSearch />
        </div>
      </header>

      <TickerTape />

      <main className="flex-1">{children}</main>

      <footer className="border-t border-hairline bg-panel px-4 py-2">
        <p className="micro leading-relaxed normal-case tracking-normal">
          THE DIP RESEARCH DESK v1.0 · Data mode: {DATA_MODE} as of {SNAPSHOT_LABEL} — figures are research fixtures until a live market-data provider is connected.
          Nothing here is investment advice; verdicts are model output for your own judgment. Short-term trading involves substantial risk of loss.
        </p>
      </footer>
    </div>
  );
}
