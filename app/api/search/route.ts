import { NextRequest, NextResponse } from "next/server";
import { searchOrganizations } from "@/lib/propublica";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ organizations: [] });
  }
  try {
    const { organizations, totalResults } = await searchOrganizations(q, { cCodeId: 3 });
    return NextResponse.json({
      organizations: organizations.slice(0, 8),
      totalResults,
    });
  } catch (err) {
    console.error("[api/search]", err);
    return NextResponse.json({ error: "Search failed. ProPublica's API may be unavailable." }, { status: 502 });
  }
}
