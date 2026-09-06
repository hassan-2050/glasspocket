# GlassPocket — Overhead Myth Buster

**Category:** Overall Winner (no specific sponsor tech required)

## The Hook
Most charity-rating tools reinforce the harmful "overhead ratio" myth. This contrarian tool argues
against that dominant heuristic by reframing efficiency around outcomes and reserves.

## What It Does
You paste a US charity's name, and it pulls their IRS Form 990 history to generate a plain-English,
context-aware financial explainer that debunks the overhead myth and shows why a high program-expense
ratio can actually indicate starved infrastructure.

## Architecture
ProPublica Nonprofit Explorer API (Form 990 financials + PDF links)
→ Node/Python for multi-year ratios and trends
→ an LLM (Gemini or other) with a strict rubric prompt for the narrative
→ Recharts for a peer-percentile chart
→ Vercel

## Weekend MVP
- 5–10 pre-cached organizations + live search
- One narrative generator
- One trend chart

## Key Challenge & Fix
**Challenge:** 990 field inconsistency across filing types.
**Fix:** Restrict data to e-filed fields that ProPublica already normalizes, and hard-code the ratio
definitions. (In fact, ProPublica's own normalized `filings_with_data` doesn't even expose a
program/management/fundraising expense split — it's "formtype dependent" per their own docs — so the
classic overhead ratio can't be reliably computed from clean data at all. That's not a workaround,
that's the thesis: we compute reserve months, revenue concentration, cost-per-dollar-raised, and
operating margin instead.)

## The Demo
A 30-second GIF: type "charity: water" and watch the myth-busting card and trend chart render.

---

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

Copy `.env.example` to `.env.local` and set `GEMINI_API_KEY` to enable live LLM narrative generation.
Without a key (or if the API call fails/rate-limits), the app falls back to a deterministic rubric
engine — the demo never breaks on stage.

### Rebuilding cached data

Pre-cached charities and peer percentile cohorts live in `data/`. Regenerate them with:

```bash
npm run build:data
```

This hits the ProPublica API and (if `GEMINI_API_KEY` is set) pre-bakes a fallback narrative for each
cached org, then writes JSON under `data/precached/` and `data/peers/`.
