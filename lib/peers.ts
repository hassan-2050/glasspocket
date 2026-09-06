import fs from "node:fs";
import path from "node:path";
import { percentileRank } from "./metrics";

// NTEE major group codes, per ProPublica's search API.
export const NTEE_CATEGORIES: Record<number, string> = {
  1: "Arts, Culture & Humanities",
  2: "Education",
  3: "Environment and Animals",
  4: "Health",
  5: "Human Services",
  6: "International, Foreign Affairs",
  7: "Public, Societal Benefit",
  8: "Religion Related",
  9: "Mutual/Membership Benefit",
  10: "Unknown, Unclassified",
};

export interface PeerCohort {
  nteeId: number;
  category: string;
  sampleSize: number;
  reserveMonths: number[];
  peopleInvestmentShare: number[];
  fundraisingCostPerDollar: number[];
}

const PEERS_DIR = path.join(process.cwd(), "data", "peers");

const cache = new Map<number, PeerCohort | null>();

export function loadPeerCohort(nteeId: number): PeerCohort | null {
  if (cache.has(nteeId)) return cache.get(nteeId)!;
  const file = path.join(PEERS_DIR, `${nteeId}.json`);
  let cohort: PeerCohort | null = null;
  try {
    const raw = fs.readFileSync(file, "utf8");
    cohort = JSON.parse(raw);
  } catch {
    cohort = null;
  }
  cache.set(nteeId, cohort);
  return cohort;
}

/** Map a raw NTEE code string like "P60" to ProPublica's major-group id. */
const NTEE_LETTER_TO_ID: Record<string, number> = {
  A: 1,
  B: 2,
  C: 3,
  D: 3,
  E: 4,
  F: 4,
  G: 4,
  H: 4,
  I: 5,
  J: 5,
  K: 5,
  L: 5,
  M: 5,
  N: 5,
  O: 5,
  P: 5,
  Q: 6,
  R: 7,
  S: 7,
  T: 7,
  U: 7,
  V: 7,
  W: 7,
  X: 8,
  Y: 9,
  Z: 10,
};

export function nteeCodeToMajorGroupId(nteeCode: string | null): number | null {
  if (!nteeCode) return null;
  const letter = nteeCode.trim().charAt(0).toUpperCase();
  return NTEE_LETTER_TO_ID[letter] ?? null;
}

export interface PercentileResult {
  reserveMonths: number | null;
  peopleInvestmentShare: number | null;
  fundraisingCostPerDollar: number | null; // lower is "better"; percentile here is raw rank, UI flips framing
  cohortSize: number;
  cohortLabel: string | null;
}

export function computePercentiles(
  nteeCode: string | null,
  metrics: { reserveMonths: number | null; peopleInvestmentShare: number | null; fundraisingCostPerDollar: number | null },
): PercentileResult {
  const nteeId = nteeCodeToMajorGroupId(nteeCode);
  const cohort = nteeId ? loadPeerCohort(nteeId) : null;
  if (!cohort) {
    return {
      reserveMonths: null,
      peopleInvestmentShare: null,
      fundraisingCostPerDollar: null,
      cohortSize: 0,
      cohortLabel: null,
    };
  }
  return {
    reserveMonths: percentileRank(metrics.reserveMonths, cohort.reserveMonths),
    peopleInvestmentShare: percentileRank(metrics.peopleInvestmentShare, cohort.peopleInvestmentShare),
    fundraisingCostPerDollar: percentileRank(metrics.fundraisingCostPerDollar, cohort.fundraisingCostPerDollar),
    cohortSize: cohort.sampleSize,
    cohortLabel: cohort.category,
  };
}
