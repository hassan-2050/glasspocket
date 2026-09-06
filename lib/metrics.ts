import type { FilingYear } from "./propublica";

// ---------------------------------------------------------------------------
// Why these metrics and not "the overhead ratio"
//
// The overhead ratio (program expense / total expense) is the dominant charity
// rating heuristic, and it's a bad one: it punishes exactly the infrastructure
// spending (staff, systems, evaluation) that makes a charity effective, and it
// rewards charities that starve their own back office. On top of that, it's
// often not even computable from clean data -- see lib/propublica.ts.
//
// Instead we compute five metrics that are (a) derivable from ProPublica's
// normalized fields, and (b) actually informative about organizational health:
//
//   1. reserveMonths          -- how long the org could operate on savings
//                                 alone. Low reserves = fragile, not "lean."
//   2. operatingMargin        -- surplus/deficit as % of revenue.
//   3. peopleInvestmentShare  -- % of spending that pays staff. The overhead
//                                 ratio counts this against a charity; we
//                                 count it as capacity.
//   4. fundraisingCostPerDollar -- professional fundraising *fees* (a real
//                                 Part IX line item) per dollar of
//                                 contributions raised. This is a narrower,
//                                 more defensible "cost to raise a dollar"
//                                 than the allocated overhead ratio.
//   5. revenue mix            -- donations vs. earned revenue vs. investment
//                                 income, i.e. concentration risk.
// ---------------------------------------------------------------------------

export interface YearMetrics {
  year: number;
  totRevenue: number;
  totExpenses: number;
  netAssetEnd: number;
  operatingMargin: number | null;
  reserveMonths: number | null;
  peopleInvestmentShare: number | null;
  donationShare: number | null;
  earnedRevenueShare: number | null;
  investmentIncomeShare: number | null;
  fundraisingCostPerDollar: number | null;
  liabilityRatio: number | null;
}

function ratio(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return numerator / denominator;
}

export function computeYearMetrics(f: FilingYear): YearMetrics {
  const peopleCost = f.officerCompensation + f.otherSalariesWages + f.payrollTax;
  return {
    year: f.taxPrdYr,
    totRevenue: f.totRevenue,
    totExpenses: f.totExpenses,
    netAssetEnd: f.totNetAssetEnd,
    operatingMargin: ratio(f.totRevenue - f.totExpenses, f.totRevenue),
    reserveMonths: ratio(f.totNetAssetEnd, f.totExpenses / 12),
    peopleInvestmentShare: ratio(peopleCost, f.totExpenses),
    donationShare: ratio(f.totContributions, f.totRevenue),
    earnedRevenueShare: ratio(f.totProgramRevenue, f.totRevenue),
    investmentIncomeShare: ratio(f.investmentIncome, f.totRevenue),
    fundraisingCostPerDollar: ratio(f.professionalFundraisingFees, f.totContributions),
    liabilityRatio: ratio(f.totLiabEnd, f.totAssetsEnd),
  };
}

export function computeAllYears(filings: FilingYear[]): YearMetrics[] {
  return filings.map(computeYearMetrics);
}

export interface Trends {
  yearsAvailable: number;
  reserveMonthsLatest: number | null;
  reserveMonthsChange: number | null; // absolute months, latest vs earliest
  avgOperatingMargin: number | null;
  consecutiveDeficitYears: number;
  netAssetCagr: number | null; // compound annual growth rate over the window
  isReservesShrinking: boolean;
  peopleInvestmentShareLatest: number | null;
  peopleInvestmentShareChange: number | null;
}

export function computeTrends(years: YearMetrics[]): Trends {
  if (years.length === 0) {
    return {
      yearsAvailable: 0,
      reserveMonthsLatest: null,
      reserveMonthsChange: null,
      avgOperatingMargin: null,
      consecutiveDeficitYears: 0,
      netAssetCagr: null,
      isReservesShrinking: false,
      peopleInvestmentShareLatest: null,
      peopleInvestmentShareChange: null,
    };
  }

  const first = years[0];
  const latest = years[years.length - 1];

  const margins = years.map((y) => y.operatingMargin).filter((m): m is number => m !== null);
  const avgOperatingMargin = margins.length
    ? margins.reduce((a, b) => a + b, 0) / margins.length
    : null;

  let consecutiveDeficitYears = 0;
  for (let i = years.length - 1; i >= 0; i--) {
    const m = years[i].operatingMargin;
    if (m !== null && m < 0) consecutiveDeficitYears++;
    else break;
  }

  let netAssetCagr: number | null = null;
  const yearSpan = latest.year - first.year;
  if (first.netAssetEnd > 0 && latest.netAssetEnd > 0 && yearSpan > 0) {
    netAssetCagr = Math.pow(latest.netAssetEnd / first.netAssetEnd, 1 / yearSpan) - 1;
  }

  const reserveMonthsChange =
    first.reserveMonths !== null && latest.reserveMonths !== null
      ? latest.reserveMonths - first.reserveMonths
      : null;

  const peopleInvestmentShareChange =
    first.peopleInvestmentShare !== null && latest.peopleInvestmentShare !== null
      ? latest.peopleInvestmentShare - first.peopleInvestmentShare
      : null;

  return {
    yearsAvailable: years.length,
    reserveMonthsLatest: latest.reserveMonths,
    reserveMonthsChange,
    avgOperatingMargin,
    consecutiveDeficitYears,
    netAssetCagr,
    isReservesShrinking: reserveMonthsChange !== null && reserveMonthsChange < -0.5,
    peopleInvestmentShareLatest: latest.peopleInvestmentShare,
    peopleInvestmentShareChange,
  };
}

/** Percentile rank of `value` within `sample` (0-100). Higher = larger than
 * more of the peer set. Returns null if there's not enough peer data. */
export function percentileRank(value: number | null, sample: number[]): number | null {
  if (value === null || sample.length < 5) return null;
  const below = sample.filter((v) => v < value).length;
  const equal = sample.filter((v) => v === value).length;
  return Math.round(((below + 0.5 * equal) / sample.length) * 100);
}
