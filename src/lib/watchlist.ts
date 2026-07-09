import { useSyncExternalStore } from "react";

export interface Position {
  ticker: string;
  addedAt: string;
  /** if set, treated as an executed entry for P&L tracking */
  entryPrice?: number;
  sizePct?: number;
}

const KEY = "the-dip:watchlist:v1";
let listeners: Array<() => void> = [];
let snapshot: Position[] = load();

function load(): Position[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Position[];
  } catch {
    return [];
  }
}

function persist(next: Position[]) {
  snapshot = next;
  localStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}

export const watchlistStore = {
  get: () => snapshot,
  subscribe(listener: () => void) {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  },
  toggle(ticker: string) {
    const exists = snapshot.some((p) => p.ticker === ticker);
    persist(
      exists
        ? snapshot.filter((p) => p.ticker !== ticker)
        : [...snapshot, { ticker, addedAt: new Date().toISOString() }],
    );
  },
  markEntered(ticker: string, entryPrice: number, sizePct: number) {
    persist(snapshot.map((p) => (p.ticker === ticker ? { ...p, entryPrice, sizePct } : p)));
  },
  clearEntry(ticker: string) {
    persist(snapshot.map((p) => (p.ticker === ticker ? { ticker: p.ticker, addedAt: p.addedAt } : p)));
  },
};

export function useWatchlist(): Position[] {
  return useSyncExternalStore(watchlistStore.subscribe, watchlistStore.get, () => []);
}

export function useIsWatched(ticker: string): boolean {
  return useWatchlist().some((p) => p.ticker === ticker);
}
