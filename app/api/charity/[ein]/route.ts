import { NextRequest, NextResponse } from "next/server";
import { buildOrgBundle, narrativeInputFor } from "@/lib/bundle";
import { generateNarrative } from "@/lib/narrative";
import { loadPrecachedBundle } from "@/lib/cache";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ ein: string }> }) {
  const { ein: einStr } = await ctx.params;
  const ein = Number(einStr);
  if (!Number.isFinite(ein) || ein <= 0) {
    return NextResponse.json({ error: "Invalid EIN" }, { status: 400 });
  }

  let bundle = loadPrecachedBundle(ein);
  const cached = !!bundle;

  if (!bundle) {
    try {
      bundle = await buildOrgBundle(ein);
    } catch (err) {
      console.error("[api/charity] upstream fetch failed", err);
      return NextResponse.json({ error: "ProPublica lookup failed" }, { status: 502 });
    }
  }

  if (!bundle) {
    return NextResponse.json(
      { error: "No e-filed Form 990 financial data found for this organization." },
      { status: 404 },
    );
  }

  const narrativeInput = narrativeInputFor(bundle);
  const narrative = narrativeInput ? await generateNarrative(narrativeInput) : null;

  return NextResponse.json({ bundle, narrative, cached });
}
