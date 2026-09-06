import { fetchOrganization } from "./propublica";
import { computeAllYears, computeTrends, type YearMetrics, type Trends } from "./metrics";
import { computePercentiles, type PercentileResult } from "./peers";
import type { NarrativeInput } from "./narrative";

export interface OrgBundle {
  ein: number;
  name: string;
  city: string | null;
  state: string | null;
  nteeCode: string | null;
  years: YearMetrics[];
  trends: Trends;
  percentiles: PercentileResult;
  pdfUrlLatest: string | null;
}

export async function buildOrgBundle(ein: number): Promise<OrgBundle | null> {
  const org = await fetchOrganization(ein);
  if (!org || org.filings.length === 0) return null;

  const years = computeAllYears(org.filings);
  const trends = computeTrends(years);
  const latest = years[years.length - 1];
  const percentiles = computePercentiles(org.nteeCode, {
    reserveMonths: latest.reserveMonths,
    peopleInvestmentShare: latest.peopleInvestmentShare,
    // A value of exactly 0 means "no professional fundraising fees reported,"
    // not "spent $0 to raise a dollar" -- treat it the same as null (not
    // applicable) rather than a real 0th-percentile cost, matching how
    // narrative.ts and the UI already treat this field elsewhere.
    fundraisingCostPerDollar: latest.fundraisingCostPerDollar ? latest.fundraisingCostPerDollar : null,
  });
  const latestFiling = org.filings[org.filings.length - 1];

  return {
    ein: org.ein,
    name: org.name,
    city: org.city,
    state: org.state,
    nteeCode: org.nteeCode,
    years,
    trends,
    percentiles,
    pdfUrlLatest: latestFiling.pdfUrl,
  };
}

export function narrativeInputFor(bundle: OrgBundle): NarrativeInput | null {
  if (bundle.years.length === 0) return null;
  return {
    orgName: bundle.name,
    latestYear: bundle.years[bundle.years.length - 1],
    trends: bundle.trends,
    percentiles: bundle.percentiles,
  };
}
