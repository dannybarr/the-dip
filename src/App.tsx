import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TerminalShell } from "@/components/terminal/TerminalShell";
import Scanner from "./pages/Scanner.tsx";
import StockAnalysis from "./pages/StockAnalysis.tsx";
import Watchlist from "./pages/Watchlist.tsx";
import Methodology from "./pages/Methodology.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <TerminalShell>
          <Routes>
            <Route path="/" element={<Scanner />} />
            <Route path="/stock/:ticker" element={<StockAnalysis />} />
            <Route path="/watchlist" element={<Watchlist />} />
            <Route path="/methodology" element={<Methodology />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </TerminalShell>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
