interface StatTileProps {
  label: string;
  value: string;
  hint?: string;
}

export default function StatTile({ label, value, hint }: StatTileProps) {
  return (
    <div className="rounded-lg border p-4" style={{ background: "var(--surface-1)", borderColor: "var(--border-hairline)" }}>
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
        {value}
      </div>
      {hint && (
        <div className="mt-1 text-xs leading-snug" style={{ color: "var(--text-secondary)" }}>
          {hint}
        </div>
      )}
    </div>
  );
}
