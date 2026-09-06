/**
 * Build-time data generator for GlassPocket.
 *
 * 1. Builds peer percentile cohorts per NTEE major category (data/peers/*.json)
 *    by sampling 501(c)(3) organizations from ProPublica's search API and
 *    computing their latest-year metrics.
 * 2. Builds pre-cached full bundles for a curated list of well-known
 *    charities (data/precached/*.json), so the demo has instant, offline-safe
 *    financial data and doesn't depend on ProPublica's live API uptime.
 *
 * Run with: npm run build:data
 *
 * Note: this script does NOT call Gemini. Narrative generation happens live,
 * per-request, in lib/narrative.ts -- there's nothing to pre-bake there.
 */
import fs from "node:fs";
import path from "node:path";
import { fetchOrganization, searchOrganizations, type OrgSummary } from "../lib/propublica";
import { computeYearMetrics } from "../lib/metrics";
import { NTEE_CATEGORIES } from "../lib/peers";
import { buildOrgBundle } from "../lib/bundle";

const ROOT = path.join(__dirname, "..");
const PEERS_DIR = path.join(ROOT, "data", "peers");
const PRECACHED_DIR = path.join(ROOT, "data", "precached");

interface CuratedOrg {
  label: string;
  ein?: number;
}

// A mix of well-known charities spanning several NTEE categories, chosen to
// give the myth-busting narrative real contrast: some carry the reserves and
// staff investment that overhead-ratio scoring would flag as "wasteful,"
// which is exactly the case this tool is built to make.
// EINs are hardcoded for orgs where ProPublica's fuzzy name search returns a
// same-named-but-wrong org as the top hit (e.g. "charity: water" is legally
// "Charity Global Inc" and ranks below several unrelated "___ Charity" orgs;
// "ACLU Foundation" without qualification matches a state affiliate first).
const CURATED_ORGS: CuratedOrg[] = [
  { label: "charity: water", ein: 223936753 },
  { label: "GiveDirectly", ein: 271661997 },
  { label: "American Red Cross" },
  { label: "Wikimedia Foundation" },
  { label: "Susan G. Komen Breast Cancer Foundation" },
  { label: "Doctors Without Borders USA" },
  { label: "Feeding America" },
  { label: "Khan Academy" },
  { label: "ACLU Foundation (national)", ein: 136213516 },
  { label: "Direct Relief" },
];

const REQUEST_DELAY_MS = 120;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function resolveEin(entry: CuratedOrg): Promise<number | null> {
  if (entry.ein) return entry.ein;
  try {
    const { organizations } = await searchOrganizations(entry.label, { cCodeId: 3 });
    if (organizations.length === 0) {
      console.warn(`  [!] no search match for "${entry.label}"`);
      return null;
    }
    return organizations[0].ein;
  } catch (err) {
    console.warn(`  [!] search failed for "${entry.label}": ${errMessage(err)}`);
    return null;
  }
}

async function buildPeerCohorts(): Promise<void> {
  fs.mkdirSync(PEERS_DIR, { recursive: true });

  for (const [idStr, category] of Object.entries(NTEE_CATEGORIES)) {
    const nteeId = Number(idStr);
    console.log(`\nBuilding peer cohort: ${category} (ntee[id]=${nteeId})`);

    const candidates: OrgSummary[] = [];
    for (let page = 0; page < 3 && candidates.length < 75; page++) {
      try {
        const { organizations } = await searchOrganizations("", { nteeId, cCodeId: 3, page });
        if (organizations.length === 0) break;
        candidates.push(...organizations);
      } catch (err) {
        console.warn(`  [!] search page ${page} failed: ${errMessage(err)}`);
        break;
      }
      await sleep(REQUEST_DELAY_MS);
    }

    const reserveMonths: number[] = [];
    const peopleInvestmentShare: number[] = [];
    const fundraisingCostPerDollar: number[] = [];
    let sampleSize = 0;

    for (const candidate of candidates.slice(0, 75)) {
      try {
        const org = await fetchOrganization(candidate.ein);
        await sleep(REQUEST_DELAY_MS);
        if (!org || org.filings.length === 0) continue;
        const latestFiling = org.filings[org.filings.length - 1];
        if (latestFiling.totExpenses <= 0 || latestFiling.totRevenue <= 0) continue;

        const m = computeYearMetrics(latestFiling);
        // Clamp reserve months to a sane range -- a handful of orgs report
        // near-zero expenses against large endowments and produce absurd
        // outliers that would distort the percentile distribution.
        if (m.reserveMonths !== null && Number.isFinite(m.reserveMonths)) {
          reserveMonths.push(Math.max(0, Math.min(m.reserveMonths, 60)));
        }
        if (m.peopleInvestmentShare !== null && Number.isFinite(m.peopleInvestmentShare)) {
          peopleInvestmentShare.push(Math.max(0, Math.min(m.peopleInvestmentShare, 1)));
        }
        if (
          m.fundraisingCostPerDollar !== null &&
          m.fundraisingCostPerDollar > 0 &&
          Number.isFinite(m.fundraisingCostPerDollar)
        ) {
          fundraisingCostPerDollar.push(Math.min(m.fundraisingCostPerDollar, 2));
        }
        sampleSize++;
      } catch (err) {
        console.warn(`  [!] EIN ${candidate.ein} failed: ${errMessage(err)}`);
      }
    }

    const cohort = {
      nteeId,
      category,
      sampleSize,
      reserveMonths,
      peopleInvestmentShare,
      fundraisingCostPerDollar,
    };
    fs.writeFileSync(path.join(PEERS_DIR, `${nteeId}.json`), JSON.stringify(cohort, null, 2));
    console.log(
      `  -> saved ${sampleSize} orgs (reserves n=${reserveMonths.length}, staff n=${peopleInvestmentShare.length}, fundraising n=${fundraisingCostPerDollar.length})`,
    );
  }
}

async function buildPrecachedOrgs(): Promise<void> {
  fs.mkdirSync(PRECACHED_DIR, { recursive: true });

  for (const entry of CURATED_ORGS) {
    const ein = await resolveEin(entry);
    if (!ein) continue;
    console.log(`\nFetching "${entry.label}" (EIN ${ein})...`);
    try {
      const bundle = await buildOrgBundle(ein);
      if (!bundle) {
        console.warn(`  [!] no e-filed financial data for "${entry.label}"`);
        continue;
      }
      fs.writeFileSync(path.join(PRECACHED_DIR, `${ein}.json`), JSON.stringify({ bundle }, null, 2));
      const latestYear = bundle.years[bundle.years.length - 1]?.year;
      console.log(`  -> saved ${bundle.years.length} year(s) of data, latest FY${latestYear}`);
    } catch (err) {
      console.warn(`  [!] failed to build bundle: ${errMessage(err)}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }
}

async function main(): Promise<void> {
  console.log("=== GlassPocket data build ===");
  await buildPeerCohorts();
  await buildPrecachedOrgs();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
