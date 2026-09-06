"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import type { YearMetrics } from "@/lib/metrics";

interface TrendChartProps {
  years: YearMetrics[];
}

interface TooltipPayloadEntry {
  value: number | null;
  name: string;
}

function ReserveTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadEntry[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value;
  return (
    <div className="rounded-md border px-3 py-2 text-sm shadow-sm" style={{ background: "var(--surface-1)", borderColor: "var(--border-hairline)" }}>
      <div style={{ color: "var(--text-muted)" }}>{label}</div>
      <div style={{ color: "var(--text-primary)" }} className="font-medium">
        {v === null || v === undefined ? "n/a" : `${v.toFixed(1)} months of reserves`}
      </div>
    </div>
  );
}

function MarginTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadEntry[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value;
  return (
    <div className="rounded-md border px-3 py-2 text-sm shadow-sm" style={{ background: "var(--surface-1)", borderColor: "var(--border-hairline)" }}>
      <div style={{ color: "var(--text-muted)" }}>{label}</div>
      <div style={{ color: "var(--text-primary)" }} className="font-medium">
        {v === null || v === undefined ? "n/a" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}% operating margin`}
      </div>
    </div>
  );
}

export default function TrendChart({ years }: TrendChartProps) {
  const reserveData = years.map((y) => ({
    year: String(y.year),
    reserveMonths: y.reserveMonths,
  }));
  const marginData = years.map((y) => ({
    year: String(y.year),
    operatingMargin: y.operatingMargin,
  }));

  const axisTick = { fill: "var(--text-muted)", fontSize: 12 };

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div>
        <h3 className="mb-1 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          Operating reserve months
        </h3>
        <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
          Net assets ÷ monthly expenses — how long the org could run on savings alone.
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={reserveData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--gridline)" vertical={false} />
            <XAxis dataKey="year" tick={axisTick} axisLine={{ stroke: "var(--baseline)" }} tickLine={false} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} width={32} />
            <Tooltip content={<ReserveTooltip />} />
            <Area
              type="monotone"
              dataKey="reserveMonths"
              stroke="var(--series-1)"
              strokeWidth={2}
              fill="var(--series-1)"
              fillOpacity={0.1}
              dot={{ r: 4, fill: "var(--series-1)", stroke: "var(--surface-1)", strokeWidth: 2 }}
              connectNulls
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h3 className="mb-1 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          Operating margin
        </h3>
        <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
          (Revenue − expenses) ÷ revenue, per fiscal year.
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={marginData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--gridline)" vertical={false} />
            <XAxis dataKey="year" tick={axisTick} axisLine={{ stroke: "var(--baseline)" }} tickLine={false} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
            <ReferenceLine y={0} stroke="var(--baseline)" />
            <Tooltip content={<MarginTooltip />} />
            <Bar dataKey="operatingMargin" radius={[4, 4, 4, 4]} maxBarSize={24}>
              {marginData.map((d, i) => (
                <Cell
                  key={i}
                  fill={
                    d.operatingMargin === null
                      ? "var(--baseline)"
                      : d.operatingMargin >= 0
                        ? "var(--series-1)"
                        : "var(--series-8-red)"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
