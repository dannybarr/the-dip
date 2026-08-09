import { Component, lazy, Suspense, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MarketProvider } from "@/context/MarketProvider";
import { TerminalShell } from "@/components/terminal/TerminalShell";
import { LoadingView } from "@/components/terminal/DataState";
import NotFound from "./pages/NotFound.tsx";

const Scanner = lazy(() => import("./pages/Scanner.tsx"));
const StockAnalysis = lazy(() => import("./pages/StockAnalysis.tsx"));
const Watchlist = lazy(() => import("./pages/Watchlist.tsx"));
const Methodology = lazy(() => import("./pages/Methodology.tsx"));
const AngelHurdle = lazy(() => import("./pages/AngelHurdle.tsx"));
const AngelDeals = lazy(() => import("./pages/AngelDeals.tsx"));
const AngelPortfolio = lazy(() => import("./pages/AngelPortfolio.tsx"));

const queryClient = new QueryClient();

interface ErrorBoundaryState {
  hasError: boolean;
}

/** Top-level crash guard. If a render throws anywhere below this, the desk
 *  shows a terminal-styled fallback with a reload action instead of a blank
 *  white screen. */
class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error("The Dip terminal crashed:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4">
          <div className="panel max-w-md p-6 text-center">
            <div className="micro text-gold">The Dip Research Desk</div>
            <h1 className="mt-2 font-mono text-lg font-bold uppercase tracking-wide text-foreground">Terminal Error</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Something broke rendering this screen. Your watchlist and logged entries are stored locally and untouched;
              reloading recovers the session.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-5 rounded-sm border border-gold/50 bg-gold/10 px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-gold"
            >
              Reload Terminal
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <MarketProvider>
            <TerminalShell>
              <Suspense fallback={<LoadingView />}>
                <Routes>
                <Route path="/" element={<Scanner />} />
                <Route path="/stock/:ticker" element={<StockAnalysis />} />
                <Route path="/watchlist" element={<Watchlist />} />
                <Route path="/methodology" element={<Methodology />} />
                <Route path="/angel" element={<AngelHurdle />} />
                <Route path="/angel/deals" element={<AngelDeals />} />
                <Route path="/angel/portfolio" element={<AngelPortfolio />} />
                <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </TerminalShell>
          </MarketProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
