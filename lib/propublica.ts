// Thin client over the ProPublica Nonprofit Explorer API.
// Docs: https://projects.propublica.org/nonprofits/api/
//
// Important limitation (this is load-bearing for the whole product thesis):
// the normalized `filings_with_data` objects this API returns do NOT include
// a program/management/fundraising functional-expense split. ProPublica's own
// docs say that breakdown is "formtype dependent" across the different 990
// variants (990 vs 990-EZ vs 990-PF). That means the classic "overhead ratio"
// (program expense / total expense) can't be computed reliably from clean,
// normalized data in the first place -- which is exactly the point this tool
// is making. See lib/metrics.ts for the metrics we compute instead.

const BASE = "https://projects.propublica.org/nonprofits/api/v2";

export interface OrgSummary {
  ein: number;
  name: string;
  city: string | null;
  state: string | null;
  nteeCode: string | null;
  subsectionCode: number | null;
  score: number;
}

export interface FilingYear {
  taxPrdYr: number;
  formType: number;
  pdfUrl: string | null;
  updated: string | null;
  totRevenue: number;
  totExpenses: number;
  totAssetsEnd: number;
  totLiabEnd: number;
  totNetAssetEnd: number;
  totContributions: number;
  totProgramRevenue: number;
  investmentIncome: number;
  grossFundraisingIncome: number;
  directFundraisingExpense: number;
  netFundraisingIncome: number;
  officerCompensation: number;
  otherSalariesWages: number;
  payrollTax: number;
  professionalFundraisingFees: number;
}

export interface OrgDetail {
  ein: number;
  name: string;
  city: string | null;
  state: string | null;
  nteeCode: string | null;
  subsectionCode: number | null;
  totalAssets: number | null;
  filings: FilingYear[]; // ascending by year, deduped (one per tax year)
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapFiling(raw: any): FilingYear {
  return {
    taxPrdYr: raw.tax_prd_yr,
    formType: raw.formtype,
    pdfUrl: raw.pdf_url ?? null,
    updated: raw.updated ?? null,
    totRevenue: num(raw.totrevenue),
    totExpenses: num(raw.totfuncexpns),
    totAssetsEnd: num(raw.totassetsend),
    totLiabEnd: num(raw.totliabend),
    totNetAssetEnd: num(raw.totnetassetend),
    totContributions: num(raw.totcntrbgfts),
    totProgramRevenue: num(raw.totprgmrevnue),
    investmentIncome: num(raw.invstmntinc),
    grossFundraisingIncome: num(raw.grsincfndrsng),
    directFundraisingExpense: num(raw.lessdirfndrsng),
    netFundraisingIncome: num(raw.netincfndrsng),
    officerCompensation: num(raw.compnsatncurrofcr),
    otherSalariesWages: num(raw.othrsalwages),
    payrollTax: num(raw.payrolltx),
    professionalFundraisingFees: num(raw.profndraising),
  };
}

/** Dedupe filings so there's one entry per tax year (amended returns can
 * produce duplicate years). Keeps the first occurrence, since ProPublica
 * returns filings newest-first and the first occurrence for a given year
 * is the one most recently indexed. */
function dedupeByYear(filings: FilingYear[]): FilingYear[] {
  const seen = new Set<number>();
  const out: FilingYear[] = [];
  for (const f of filings) {
    if (seen.has(f.taxPrdYr)) continue;
    seen.add(f.taxPrdYr);
    out.push(f);
  }
  return out.sort((a, b) => a.taxPrdYr - b.taxPrdYr);
}

export async function searchOrganizations(
  query: string,
  opts: { nteeId?: number; cCodeId?: number; page?: number } = {},
): Promise<{ organizations: OrgSummary[]; totalResults: number }> {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (opts.nteeId) params.set("ntee[id]", String(opts.nteeId));
  if (opts.cCodeId) params.set("c_code[id]", String(opts.cCodeId));
  if (opts.page) params.set("page", String(opts.page));

  const res = await fetch(`${BASE}/search.json?${params.toString()}`, {
    // Search results change slowly; cache briefly at the edge/runtime.
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    throw new Error(`ProPublica search failed: ${res.status}`);
  }
  const data = await res.json();
  return {
    totalResults: data.total_results ?? 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    organizations: (data.organizations ?? []).map((o: any) => ({
      ein: o.ein,
      name: o.name,
      city: o.city ?? null,
      state: o.state ?? null,
      nteeCode: o.ntee_code ?? null,
      subsectionCode: o.subseccd ?? null,
      score: o.score ?? 0,
    })),
  };
}

export async function fetchOrganization(ein: number): Promise<OrgDetail | null> {
  const res = await fetch(`${BASE}/organizations/${ein}.json`, {
    next: { revalidate: 3600 * 24 },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`ProPublica organization fetch failed: ${res.status}`);
  }
  const data = await res.json();
  const org = data.organization ?? {};
  const filings = dedupeByYear(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data.filings_with_data ?? []).map((f: any) => mapFiling(f)),
  );
  return {
    ein: org.ein,
    name: org.name,
    city: org.city ?? null,
    state: org.state ?? null,
    nteeCode: org.ntee_code ?? null,
    subsectionCode: org.subsection_code ?? null,
    totalAssets: org.asset_amount ?? null,
    filings,
  };
}
