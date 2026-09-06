export function pct(v: number | null, digits = 0): string {
  if (v === null || Number.isNaN(v)) return "n/a";
  return `${(v * 100).toFixed(digits)}%`;
}

export function money(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export function months(v: number | null): string {
  if (v === null) return "n/a";
  return `${v.toFixed(1)} month${v === 1 ? "" : "s"}`;
}

/** Formats a cost-per-dollar ratio (e.g. 0.00108) as cents, e.g. "11¢" or
 * "<1¢" for a nonzero value that would otherwise round down to "0¢". */
export function centsPerDollar(v: number): string {
  const cents = v * 100;
  if (cents > 0 && cents < 0.5) return "<1¢";
  return `${cents.toFixed(0)}¢`;
}
