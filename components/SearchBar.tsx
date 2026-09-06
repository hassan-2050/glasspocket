"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface SearchResult {
  ein: number;
  name: string;
  city: string | null;
  state: string | null;
  nteeCode: string | null;
}

export default function SearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      debounceRef.current = setTimeout(() => {
        setResults([]);
        setOpen(false);
      }, 0);
      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        if (data.error) {
          setError(data.error);
          setResults([]);
        } else {
          setError(null);
          setResults(data.organizations ?? []);
        }
        setOpen(true);
      } catch {
        setError("Search is unavailable right now.");
        setResults([]);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function select(ein: number) {
    setOpen(false);
    router.push(`/charity/${ein}`);
  }

  return (
    <div className="relative w-full max-w-xl">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Search a US charity, e.g. &quot;charity: water&quot;"
        className="w-full rounded-lg border px-4 py-3 text-base outline-none transition-shadow focus:shadow-md"
        style={{
          background: "var(--surface-1)",
          borderColor: "var(--border-hairline)",
          color: "var(--text-primary)",
        }}
      />
      {open && (
        <div
          className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border shadow-lg"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-hairline)" }}
        >
          {loading && (
            <div className="px-4 py-3 text-sm" style={{ color: "var(--text-muted)" }}>
              Searching…
            </div>
          )}
          {!loading && error && (
            <div className="px-4 py-3 text-sm" style={{ color: "var(--status-critical)" }}>
              {error}
            </div>
          )}
          {!loading && !error && results.length === 0 && (
            <div className="px-4 py-3 text-sm" style={{ color: "var(--text-muted)" }}>
              No matching 501(c)(3) organizations found.
            </div>
          )}
          {!loading &&
            !error &&
            results.map((r) => (
              <button
                key={r.ein}
                onClick={() => select(r.ein)}
                className="block w-full border-b px-4 py-3 text-left text-sm transition-colors last:border-b-0 hover:opacity-80"
                style={{ borderColor: "var(--border-hairline)" }}
              >
                <div style={{ color: "var(--text-primary)" }} className="font-medium">
                  {r.name}
                </div>
                <div style={{ color: "var(--text-muted)" }} className="text-xs">
                  {[r.city, r.state].filter(Boolean).join(", ") || "Location unknown"} · EIN {r.ein}
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
