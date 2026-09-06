import Link from "next/link";
import { loadPrecachedBundle } from "@/lib/cache";
import { buildOrgBundle, narrativeInputFor, type OrgBundle } from "@/lib/bundle";
import { generateNarrative, buildRubricNarrative, type NarrativeResult } from "@/lib/narrative";
import { money, months, pct, centsPerDollar } from "@/lib/format";
import MythBusterCard from "@/components/MythBusterCard";
import TrendChart from "@/components/TrendChart";
import PercentileChart from "@/components/PercentileChart";
import StatTile from "@/components/StatTile";
import CharityChat from "@/components/CharityChat";

export const revalidate = 3600;

interface CharityPageProps {
  params: Promise<{ ein: string }>;
}

async function loadBundle(ein: number): Promise<{ bundle: OrgBundle | null; cached: boolean }> {
  const precached = loadPrecachedBundle(ein);
  if (precached) return { bundle: precached, cached: true };
  try {
    const bundle = await buildOrgBundle(ein);
    return { bundle, cached: false };
  } catch {
    return { bundle: null, cached: false };
  }
}

export default async function CharityPage({ params }: CharityPageProps) {
  const { ein: einStr } = await params;
  const ein = Number(einStr);

  if (!Number.isFinite(ein) || ein <= 0) {
    return (
      <ErrorState message="That doesn't look like a valid EIN." />
    );
  }

  const { bundle, cached } = await loadBundle(ein);

  if (!bundle) {
    return (
      <ErrorState message="Couldn't find e-filed Form 990 financial data for that organization. ProPublica's Nonprofit Explorer only indexes organizations that filed electronically." />
    );
  }

  const narrativeInput = narrativeInputFor(bundle);
  const emptyNarrative: NarrativeResult = {
    headline: "No financial data available to narrate.",
    summary: "",
    mythBusts: [],
    watchOuts: [],
    source: "rubric",
  };
  let narrative: NarrativeResult;
  try {
    narrative = narrativeInput ? await generateNarrative(narrativeInput) : emptyNarrative;
  } catch {
    narrative = narrativeInput ? buildRubricNarrative(narrativeInput) : emptyNarrative;
  }

  const latest = bundle.years[bundle.years.length - 1];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <Link href="/" className="mb-6 inline-block text-sm hover:opacity-70" style={{ color: "var(--text-muted)" }}>
        ← Back to search
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl" style={{ color: "var(--text-primary)" }}>
          {bundle.name}
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          {[bundle.city, bundle.state].filter(Boolean).join(", ") || "Location unknown"} · EIN {bundle.ein}
          {bundle.years.length > 0 && ` · FY${latest.year} is the latest filing on record`}
          {cached && " · pre-cached"}
        </p>
      </header>

      <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Total revenue (latest FY)" value={money(latest.totRevenue)} />
        <StatTile label="Reserve months" value={months(latest.reserveMonths)} hint="Net assets ÷ monthly expenses" />
        <StatTile
          label="Invested in staff"
          value={pct(latest.peopleInvestmentShare)}
          hint="Share of spending on compensation"
        />
        <StatTile
          label="Fundraising cost"
          value={
            latest.fundraisingCostPerDollar !== null && latest.fundraisingCostPerDollar > 0
              ? `${centsPerDollar(latest.fundraisingCostPerDollar)} / $1`
              : "n/a"
          }
          hint="Professional fundraising fees per dollar contributed"
        />
      </section>

      <section className="mb-8">
        <MythBusterCard ein={bundle.ein} initialNarrative={narrative} />
      </section>

      <section className="mb-8 rounded-xl border p-5 sm:p-6" style={{ background: "var(--surface-1)", borderColor: "var(--border-hairline)" }}>
        <h2 className="mb-4 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Multi-year trend
        </h2>
        {bundle.years.length > 1 ? (
          <TrendChart years={bundle.years} />
        ) : (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Only one year of e-filed data is available — not enough for a trend.
          </p>
        )}
      </section>

      <section className="mb-8 rounded-xl border p-5 sm:p-6" style={{ background: "var(--surface-1)", borderColor: "var(--border-hairline)" }}>
        <h2 className="mb-4 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          How it compares to peers
        </h2>
        <PercentileChart percentiles={bundle.percentiles} />
      </section>

      <section className="mb-8">
        <CharityChat ein={bundle.ein} orgName={bundle.name} />
      </section>

      {bundle.pdfUrlLatest && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Source:{" "}
          <a href={bundle.pdfUrlLatest} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-70">
            latest Form 990 PDF
          </a>{" "}
          via ProPublica Nonprofit Explorer.
        </p>
      )}
    </main>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col items-center px-4 py-24 text-center">
      <p className="mb-4 text-lg font-medium" style={{ color: "var(--text-primary)" }}>
        {message}
      </p>
      <Link href="/" className="text-sm underline hover:opacity-70" style={{ color: "var(--series-1)" }}>
        ← Try another search
      </Link>
    </main>
  );
}
