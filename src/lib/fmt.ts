export const fmtPrice = (v: number) =>
  v >= 1000 ? v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v.toFixed(2);

export const fmtPct = (v: number, signed = true) =>
  `${signed && v > 0 ? "+" : ""}${v.toFixed(2)}%`;

export const fmtPct1 = (v: number, signed = true) =>
  `${signed && v > 0 ? "+" : ""}${v.toFixed(1)}%`;

export const fmtCap = (b: number) => (b >= 1000 ? `$${(b / 1000).toFixed(2)}T` : b >= 1 ? `$${b.toFixed(0)}B` : `$${(b * 1000).toFixed(0)}M`);

export const fmtX = (v: number) => `${v.toFixed(1)}x`;

export const dirClass = (v: number) => (v > 0 ? "text-up" : v < 0 ? "text-down" : "text-muted-foreground");
