import type { YearMetrics, Trends } from "./metrics";
import type { PercentileResult } from "./peers";
import { pct, money, months, centsPerDollar } from "./format";

export interface MythBust {
  claim: string; // what overhead-ratio thinking would assume
  reality: string; // the reframe, grounded in the actual numbers
}

export interface NarrativeResult {
  headline: string;
  summary: string;
  mythBusts: MythBust[];
  watchOuts: string[];
  source: "gemini" | "rubric";
}

export interface NarrativeInput {
  orgName: string;
  latestYear: YearMetrics;
  trends: Trends;
  percentiles: PercentileResult;
}

// ---------------------------------------------------------------------------
// Deterministic rubric engine -- zero dependencies, always available.
// This is the fallback (and, without an API key, the primary) narrative
// generator. Every claim it makes traces directly to a computed number.
// ---------------------------------------------------------------------------

export function buildRubricNarrative(input: NarrativeInput): NarrativeResult {
  const { orgName, latestYear: y, trends, percentiles: p } = input;
  const mythBusts: MythBust[] = [];
  const watchOuts: string[] = [];

  // --- Reserves ---------------------------------------------------------
  if (y.reserveMonths !== null) {
    if (y.reserveMonths < 3) {
      watchOuts.push(
        `${orgName} holds only ${months(y.reserveMonths)} of operating reserves. A conventional rating tool that rewards low overhead would call this "lean" -- but under 3 months means one delayed grant or a bad fundraising quarter could force program cuts.`,
      );
    } else {
      mythBusts.push({
        claim: `A charity with visible reserves is "sitting on donor money" instead of spending it on programs.`,
        reality: `${orgName} carries ${months(y.reserveMonths)} of operating reserves${
          p.reserveMonths !== null
            ? ` (more than ${p.reserveMonths}% of similar ${p.cohortLabel ?? ""} organizations)`
            : ""
        }. That's a resilience buffer, not waste -- nonprofit finance experts generally recommend 3-6 months minimum, and reserves are exactly what let an organization keep operating through a slow fundraising quarter without cutting programs.`,
      });
    }
  }

  // --- People investment --------------------------------------------------
  if (y.peopleInvestmentShare !== null) {
    mythBusts.push({
      claim: `Money spent on staff salaries is "overhead" -- money that didn't reach the people the charity serves.`,
      reality: `${pct(y.peopleInvestmentShare)} of ${orgName}'s spending goes to compensation${
        p.peopleInvestmentShare !== null
          ? ` (higher than ${p.peopleInvestmentShare}% of peer organizations)`
          : ""
      }. Staff *are* how programs get delivered -- underpaying or understaffing to keep this number low is a known driver of the "nonprofit starvation cycle," where pressure to look lean erodes the infrastructure needed to be effective.`,
    });
  }

  // --- Fundraising cost ------------------------------------------------
  if (y.fundraisingCostPerDollar !== null && y.fundraisingCostPerDollar > 0) {
    const cents = y.fundraisingCostPerDollar * 100;
    const centsLabel = centsPerDollar(y.fundraisingCostPerDollar);
    if (cents <= 25) {
      mythBusts.push({
        claim: `The "cost to raise a dollar" should be near zero, or the charity is being inefficient.`,
        reality: `${orgName} spent about ${centsLabel} in professional fundraising fees per dollar contributed${
          p.fundraisingCostPerDollar !== null ? ` (better than ${100 - p.fundraisingCostPerDollar}% of peers)` : ""
        }. Some investment in fundraising capacity is normal and usually pays for itself many times over.`,
      });
    } else {
      watchOuts.push(
        `Professional fundraising fees ran about ${centsLabel} per dollar contributed in the latest filing -- worth watching, though a single elevated year (e.g. a new donor-acquisition push) isn't necessarily a red flag.`,
      );
    }
  }

  // --- Revenue concentration ---------------------------------------------
  if (y.donationShare !== null && y.donationShare > 0.9) {
    watchOuts.push(
      `${pct(y.donationShare)} of revenue comes from contributions alone, with little earned revenue or investment income to diversify against a downturn in giving.`,
    );
  }

  // --- Deficits / shrinking reserves --------------------------------------
  if (trends.consecutiveDeficitYears >= 2) {
    watchOuts.push(
      `${orgName} has run an operating deficit for ${trends.consecutiveDeficitYears} consecutive years on record. Sustained deficits are a real signal worth investigating -- unlike a "high" overhead ratio, this genuinely predicts financial trouble.`,
    );
  } else if (trends.avgOperatingMargin !== null && trends.avgOperatingMargin > 0) {
    mythBusts.push({
      claim: `Any year where revenue exceeds expenses means the charity is "hoarding" donations.`,
      reality: `${orgName} has averaged a ${pct(trends.avgOperatingMargin)} operating margin across ${trends.yearsAvailable} years on record. A modest, consistent surplus is how reserves get built in the first place -- the alternative is spending every dollar as it arrives and having nothing left when revenue dips.`,
    });
  }

  if (trends.isReservesShrinking) {
    watchOuts.push(
      `Reserve months have fallen by ${months(Math.abs(trends.reserveMonthsChange ?? 0))} since the earliest year on record -- a pattern consistent with an organization trimming its own buffer, possibly under pressure to look "lean."`,
    );
  }

  const headline =
    watchOuts.length > mythBusts.length
      ? `${orgName}'s numbers raise real questions -- but not the ones the overhead ratio would ask.`
      : `${orgName} looks financially healthier than an overhead-ratio score would suggest.`;

  const summary = `In its latest filing, ${orgName} reported ${money(y.totRevenue)} in revenue and ${money(
    y.totExpenses,
  )} in expenses, ending the year with ${months(y.reserveMonths)} of operating reserves. Rather than reducing that to a single "percent spent on overhead" figure -- a number the underlying IRS data often can't even support consistently -- here's what the trend across ${trends.yearsAvailable} year${
    trends.yearsAvailable === 1 ? "" : "s"
  } of filings actually shows.`;

  return {
    headline,
    summary,
    mythBusts: mythBusts.slice(0, 3),
    watchOuts: watchOuts.slice(0, 3),
    source: "rubric",
  };
}

// ---------------------------------------------------------------------------
// Gemini-backed narrative. Uses a strict response schema so the model can
// only phrase the numbers we hand it -- it cannot introduce new figures.
// Falls back to the rubric engine on any error, missing key, or timeout.
// ---------------------------------------------------------------------------

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_TIMEOUT_MS = 12_000;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    summary: { type: "string" },
    mythBusts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          claim: { type: "string" },
          reality: { type: "string" },
        },
        required: ["claim", "reality"],
      },
      maxItems: 3,
    },
    watchOuts: {
      type: "array",
      items: { type: "string" },
      maxItems: 3,
    },
  },
  required: ["headline", "summary", "mythBusts", "watchOuts"],
};

function buildPrompt(input: NarrativeInput): string {
  const { orgName, latestYear: y, trends, percentiles: p } = input;
  // We hand the model only pre-computed numbers, already formatted, and
  // forbid it from inventing new ones. This is the "strict rubric prompt"
  // called for in the architecture: the LLM's job is prose, not arithmetic.
  return `You are a financial explainer for GlassPocket, a tool that argues AGAINST the "overhead ratio" myth in charity evaluation (the idea that a charity is only good if it spends almost nothing on staff/infrastructure). You are contrarian on purpose: the overhead ratio is a bad heuristic that punishes effective organizations for having real infrastructure.

Write about this organization using ONLY the numbers below. Do not invent, estimate, or restate any number not given here. Do not add a program/management/fundraising expense breakdown -- that data is not available and you must not imply it is. If a value is "n/a", omit that point rather than guessing.

Organization: ${orgName}
Latest fiscal year: ${y.year}
Total revenue: ${money(y.totRevenue)}
Total expenses: ${money(y.totExpenses)}
Operating margin (latest year): ${pct(y.operatingMargin)}
Average operating margin across ${trends.yearsAvailable} years on record: ${pct(trends.avgOperatingMargin)}
Consecutive deficit years (most recent streak): ${trends.consecutiveDeficitYears}
Operating reserve months (net assets / monthly expenses): ${months(y.reserveMonths)}
Change in reserve months since earliest year on record: ${
    trends.reserveMonthsChange !== null ? trends.reserveMonthsChange.toFixed(1) : "n/a"
  }
Share of spending on compensation (officers + other salaries + payroll tax): ${pct(y.peopleInvestmentShare)}
Donation share of revenue: ${pct(y.donationShare)}
Earned revenue (program service revenue) share of revenue: ${pct(y.earnedRevenueShare)}
Professional fundraising fees per dollar contributed: ${
    y.fundraisingCostPerDollar !== null && y.fundraisingCostPerDollar > 0
      ? centsPerDollar(y.fundraisingCostPerDollar)
      : "n/a (no professional fundraising fees reported)"
  }
Peer percentile for reserve months (higher = more reserves than peers), among ${p.cohortLabel ?? "peer"} organizations (n=${p.cohortSize}): ${
    p.reserveMonths !== null ? `${p.reserveMonths}th percentile` : "n/a"
  }
Peer percentile for compensation share of spending: ${
    p.peopleInvestmentShare !== null ? `${p.peopleInvestmentShare}th percentile` : "n/a"
  }

Task: Produce JSON matching the given schema.
- "headline": one punchy sentence, contrarian in tone, specific to this org's numbers.
- "summary": 2-3 sentences giving an honest overview of financial position, in plain English, no jargon.
- "mythBusts": 1-3 items, each pairing a common overhead-ratio-style assumption ("claim") with what this org's actual numbers show instead ("reality"). Only include a mythBust if the numbers actually support it.
- "watchOuts": 0-3 items, genuine concerns the numbers reveal (e.g. deficits, thin reserves, revenue concentration). Be honest here -- this tool loses credibility if it only ever says good things. If nothing concerning stands out, return an empty array.

Tone: confident, plain-English, slightly contrarian, never preachy. No markdown formatting inside the strings.`;
}

async function callGemini(input: NarrativeInput, apiKey: string): Promise<NarrativeResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(input) }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 2048,
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
            // Gemini 2.5 Flash spends hidden "thinking" tokens out of the same
            // maxOutputTokens budget by default, which was truncating our
            // longer prompts mid-JSON. This is plain structured formatting of
            // numbers we already computed, not a reasoning task -- disable it.
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
        signal: controller.signal,
      },
    );
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("");
    if (!text) throw new Error("Gemini returned no text");
    const parsed = JSON.parse(text);
    if (!parsed.headline || !parsed.summary || !Array.isArray(parsed.mythBusts)) {
      throw new Error("Gemini response failed schema shape check");
    }
    return {
      headline: parsed.headline,
      summary: parsed.summary,
      mythBusts: parsed.mythBusts,
      watchOuts: parsed.watchOuts ?? [],
      source: "gemini",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateNarrative(input: NarrativeInput): Promise<NarrativeResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return buildRubricNarrative(input);
  }
  try {
    return await callGemini(input, apiKey);
  } catch (err) {
    console.warn("[narrative] Gemini call failed, falling back to rubric engine:", err);
    return buildRubricNarrative(input);
  }
}
