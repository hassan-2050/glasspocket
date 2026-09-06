import type { OrgBundle } from "./bundle";
import { money, pct, months, centsPerDollar } from "./format";

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_TIMEOUT_MS = 15_000;
const MAX_HISTORY_MESSAGES = 8;
export const MAX_QUESTION_LENGTH = 400;

function buildDataDossier(bundle: OrgBundle): string {
  const lines: string[] = [];
  lines.push(`Organization: ${bundle.name}`);
  lines.push(`Location: ${[bundle.city, bundle.state].filter(Boolean).join(", ") || "unknown"}`);
  lines.push(`EIN: ${bundle.ein}`);
  lines.push(`NTEE code: ${bundle.nteeCode ?? "unknown"}`);
  lines.push("");
  lines.push("Year-by-year financials, from e-filed IRS Form 990s via ProPublica Nonprofit Explorer:");
  for (const y of bundle.years) {
    const parts = [
      `revenue ${money(y.totRevenue)}`,
      `expenses ${money(y.totExpenses)}`,
      `operating margin ${pct(y.operatingMargin)}`,
      `reserve months ${months(y.reserveMonths)}`,
      `staff/compensation share of spending ${pct(y.peopleInvestmentShare)}`,
      `donation share of revenue ${pct(y.donationShare)}`,
      `earned revenue share ${pct(y.earnedRevenueShare)}`,
    ];
    if (y.fundraisingCostPerDollar && y.fundraisingCostPerDollar > 0) {
      parts.push(`professional fundraising fees ${centsPerDollar(y.fundraisingCostPerDollar)} per dollar contributed`);
    }
    lines.push(`- FY${y.year}: ${parts.join(", ")}`);
  }
  lines.push("");
  lines.push(
    `Trends: average operating margin ${pct(bundle.trends.avgOperatingMargin)} across ${bundle.trends.yearsAvailable} years on record, ` +
      `${bundle.trends.consecutiveDeficitYears} consecutive deficit year(s) most recently, ` +
      `reserve months changed by ${
        bundle.trends.reserveMonthsChange !== null ? bundle.trends.reserveMonthsChange.toFixed(1) : "n/a"
      } since the earliest year on record.`,
  );
  if (bundle.percentiles.cohortLabel) {
    lines.push("");
    lines.push(`Peer comparison, among ${bundle.percentiles.cohortSize} similar "${bundle.percentiles.cohortLabel}" organizations:`);
    if (bundle.percentiles.reserveMonths !== null) {
      lines.push(`- Reserve months: ${bundle.percentiles.reserveMonths}th percentile (higher = more reserves than peers)`);
    }
    if (bundle.percentiles.peopleInvestmentShare !== null) {
      lines.push(`- Staff/compensation investment share: ${bundle.percentiles.peopleInvestmentShare}th percentile`);
    }
    if (bundle.percentiles.fundraisingCostPerDollar !== null) {
      const efficiencyPercentile = 100 - bundle.percentiles.fundraisingCostPerDollar;
      lines.push(
        `- Fundraising efficiency: ${efficiencyPercentile}th percentile (raises money more cheaply, in professional fundraising fees per dollar contributed, than ${efficiencyPercentile}% of peers -- higher is better here, same as the other two)`,
      );
    }
  }
  return lines.join("\n");
}

function systemPrompt(bundle: OrgBundle): string {
  return `You are GlassPocket's assistant. GlassPocket argues AGAINST the "overhead ratio" myth in charity evaluation -- the idea that a charity is only good if it spends almost nothing on staff and infrastructure. You are contrarian about that framing on purpose, the same way the rest of this app is: reserves, staff investment, and even the occasional deficit are not automatically bad.

You help people understand ONE specific charity's IRS Form 990 financial history, given below as a data dossier. Ground every claim ONLY in that dossier. Never invent numbers, programs, leadership names, mission statements, news, or scandals not present here. If asked something the dossier doesn't cover (what the charity does on the ground, who runs it, whether there's been controversy, its official mission), say plainly that you only have their financial filing data and don't know that -- don't guess or make something plausible-sounding up.

Keep answers conversational and concise: 2-5 sentences unless the question genuinely calls for a year-by-year breakdown or comparison, in which case a short list is fine. No markdown headers, no bold/italic formatting -- plain conversational text.

Be careful with the arithmetic: reserve months (net assets / monthly expenses) and operating margin (revenue vs. expenses) are different things and don't always move together. A year can have a strongly POSITIVE operating margin and still show falling reserve months, if expenses grew faster than reserves did (e.g. a program scaled up quickly). Never describe a year as a "deficit" or "negative margin" unless its operating margin figure in the dossier is actually negative -- check the sign before you characterize a year.

--- DATA DOSSIER ---
${buildDataDossier(bundle)}
--- END DOSSIER ---`;
}

export async function askAboutCharity(bundle: OrgBundle, history: ChatMessage[], question: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const trimmedQuestion = question.trim().slice(0, MAX_QUESTION_LENGTH);
  if (!trimmedQuestion) throw new Error("Empty question");

  const recentHistory = history.slice(-MAX_HISTORY_MESSAGES);
  const contents = [
    ...recentHistory.map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.text.slice(0, MAX_QUESTION_LENGTH) }],
    })),
    { role: "user", parts: [{ text: trimmedQuestion }] },
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: systemPrompt(bundle) }] },
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 2048,
            // Unlike the narrative generator (pure phrasing of a precomputed
            // conclusion), chat questions often require live arithmetic across
            // multiple years/fields (e.g. "why did reserves drop" needs to
            // relate reserve-month deltas to expense growth, not just margin
            // sign) -- leave thinking enabled so it can actually work that out.
          },
        }),
        signal: controller.signal,
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Gemini HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? "")
      .join("")
      .trim();
    if (!text) throw new Error("Gemini returned no text");
    return text;
  } finally {
    clearTimeout(timeout);
  }
}
