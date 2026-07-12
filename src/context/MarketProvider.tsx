import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { computeBreadth, loadMarket, type Breadth, type MarketData } from "@/lib/engine/market";
import type { Analysis } from "@/lib/types";

interface MarketContextValue {
  data: MarketData | undefined;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  refresh: () => void;
  analyses: Analysis[];
  breadth: Breadth;
  byTicker: (ticker: string) => Analysis | undefined;
}

const MarketContext = createContext<MarketContextValue | null>(null);

export function MarketProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: ["market"],
    queryFn: loadMarket,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const value = useMemo<MarketContextValue>(() => {
    const analyses = query.data?.analyses ?? [];
    const byTicker = (ticker: string) =>
      analyses.find((a) => a.stock.ticker.toUpperCase() === ticker.toUpperCase());
    return {
      data: query.data,
      isLoading: query.isLoading,
      isError: query.isError,
      isFetching: query.isFetching,
      refresh: () => query.refetch(),
      analyses,
      breadth: computeBreadth(analyses),
      byTicker,
    };
  }, [query]);

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}

export function useMarket(): MarketContextValue {
  const ctx = useContext(MarketContext);
  if (!ctx) throw new Error("useMarket must be used within a MarketProvider");
  return ctx;
}
