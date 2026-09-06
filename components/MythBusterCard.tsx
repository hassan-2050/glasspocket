"use client";

import { useState } from "react";
import type { NarrativeResult } from "@/lib/narrative";

interface MythBusterCardProps {
  ein: number;
  initialNarrative: NarrativeResult;
}

export default function MythBusterCard({ ein, initialNarrative }: MythBusterCardProps) {
  const [narrative, setNarrative] = useState(initialNarrative);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function regenerate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/charity/${ein}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      if (data.narrative) setNarrative(data.narrative);
    } catch {
      setError("Couldn't regenerate right now — showing the previous version.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="rounded-xl border p-5 sm:p-6"
      style={{ background: "var(--surface-1)", borderColor: "var(--border-hairline)" }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
          style={{
            background: narrative.source === "gemini" ? "rgba(42,120,214,0.1)" : "rgba(137,135,129,0.15)",
            color: narrative.source === "gemini" ? "var(--series-1)" : "var(--text-secondary)",
          }}
        >
          {narrative.source === "gemini" ? "✨ Gemini narrative" : "Rubric engine (offline-safe)"}
        </span>
        <button
          onClick={regenerate}
          disabled={loading}
          className="rounded-md border px-3 py-1 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{ borderColor: "var(--border-hairline)", color: "var(--text-secondary)" }}
        >
          {loading ? "Regenerating…" : "↻ Regenerate"}
        </button>
      </div>

      <h2 className="mb-2 text-xl font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>
        {narrative.headline}
      </h2>
      <p className="mb-5 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        {narrative.summary}
      </p>

      {narrative.mythBusts.length > 0 && (
        <div className="mb-5 space-y-3">
          {narrative.mythBusts.map((mb, i) => (
            <div key={i} className="rounded-lg border-l-2 pl-3" style={{ borderColor: "var(--series-1)" }}>
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                Myth
              </p>
              <p className="mb-1.5 text-sm" style={{ color: "var(--text-secondary)" }}>
                {mb.claim}
              </p>
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--series-1)" }}>
                Reality
              </p>
              <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                {mb.reality}
              </p>
            </div>
          ))}
        </div>
      )}

      {narrative.watchOuts.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide" style={{ color: "var(--status-serious)" }}>
            Worth watching
          </p>
          <ul className="space-y-1">
            {narrative.watchOuts.map((w, i) => (
              <li key={i} className="text-sm" style={{ color: "var(--text-secondary)" }}>
                • {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p className="mt-3 text-xs" style={{ color: "var(--status-critical)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
