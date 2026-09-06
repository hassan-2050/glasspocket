"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Cell } from "recharts";
import type { PercentileResult } from "@/lib/peers";

interface PercentileChartProps {
  percentiles: PercentileResult;
}

interface Row {
  metric: string;
  percentile: number;
  blurb: string;
}

interface TooltipPayloadEntry {
  payload: Row;
}

function PercentileTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadEntry[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div
      className="max-w-[220px] rounded-md border px-3 py-2 text-sm shadow-sm"
      style={{ background: "var(--surface-1)", borderColor: "var(--border-hairline)" }}
    >
      <div style={{ color: "var(--text-primary)" }} className="font-medium">
        {row.metric}
      </div>
      <div style={{ color: "var(--text-secondary)" }} className="text-xs">
        {row.blurb}
      </div>
    </div>
  );
}

export default function PercentileChart({ percentiles: p }: PercentileChartProps) {
  if (!p.cohortLabel || p.cohortSize < 5) {
    return (
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Not enough peer data cached for this organization&apos;s category yet to draw a percentile comparison.
      </p>
    );
  }

  const rows: Row[] = [];
  if (p.reserveMonths !== null) {
    rows.push({
      metric: "Reserve months",
      percentile: p.reserveMonths,
      blurb: `More operating reserves than ${p.reserveMonths}% of similar ${p.cohortLabel} organizations (n=${p.cohortSize}).`,
    });
  }
  if (p.peopleInvestmentShare !== null) {
    rows.push({
      metric: "Investment in staff",
      percentile: p.peopleInvestmentShare,
      blurb: `Spends a higher share on compensation than ${p.peopleInvestmentShare}% of peers — capacity, not waste.`,
    });
  }
  if (p.fundraisingCostPerDollar !== null) {
    const inverted = 100 - p.fundraisingCostPerDollar;
    rows.push({
      metric: "Fundraising efficiency",
      percentile: inverted,
      blurb: `Raises money more efficiently (lower professional fundraising fees per dollar) than ${inverted}% of peers.`,
    });
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Not enough of this organization&apos;s own metrics are available to compare against peers.
      </p>
    );
  }

  const axisTick = { fill: "var(--text-muted)", fontSize: 12 };

  return (
    <div>
      <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
        Percentile rank among {p.cohortSize} {p.cohortLabel} organizations. Higher is framed as better on every bar
        here — including reserves and staff investment, which conventional overhead-ratio scoring would penalize.
      </p>
      <ResponsiveContainer width="100%" height={rows.length * 56 + 24}>
        <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
          <CartesianGrid stroke="var(--gridline)" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 100]}
            tick={axisTick}
            axisLine={{ stroke: "var(--baseline)" }}
            tickLine={false}
            tickFormatter={(v) => `${v}`}
          />
          <YAxis
            type="category"
            dataKey="metric"
            tick={{ fill: "var(--text-primary)", fontSize: 13 }}
            axisLine={false}
            tickLine={false}
            width={140}
          />
          <ReferenceLine x={50} stroke="var(--baseline)" strokeDasharray="3 3" />
          <Tooltip content={<PercentileTooltip />} cursor={{ fill: "var(--gridline)", opacity: 0.4 }} />
          <Bar dataKey="percentile" radius={[0, 4, 4, 0]} maxBarSize={24}>
            {rows.map((_, i) => (
              <Cell key={i} fill="var(--series-1)" />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-1 text-right text-[11px]" style={{ color: "var(--text-muted)" }}>
        Dashed line = peer median (50th percentile)
      </p>
    </div>
  );
}
