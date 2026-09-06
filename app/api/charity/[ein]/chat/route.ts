import { NextRequest, NextResponse } from "next/server";
import { loadPrecachedBundle } from "@/lib/cache";
import { buildOrgBundle } from "@/lib/bundle";
import { askAboutCharity, MAX_QUESTION_LENGTH, type ChatMessage } from "@/lib/chat";

const MAX_HISTORY_ITEMS = 20;

interface ChatRequestBody {
  question?: unknown;
  history?: unknown;
}

function isChatMessage(m: unknown): m is ChatMessage {
  if (!m || typeof m !== "object") return false;
  const obj = m as Record<string, unknown>;
  return (obj.role === "user" || obj.role === "assistant") && typeof obj.text === "string";
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ ein: string }> }) {
  const { ein: einStr } = await ctx.params;
  const ein = Number(einStr);
  if (!Number.isFinite(ein) || ein <= 0) {
    return NextResponse.json({ error: "Invalid EIN" }, { status: 400 });
  }

  let body: ChatRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ error: "Question is required" }, { status: 400 });
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json({ error: `Keep questions under ${MAX_QUESTION_LENGTH} characters` }, { status: 400 });
  }

  const rawHistory = Array.isArray(body.history) ? body.history : [];
  const history: ChatMessage[] = rawHistory
    .filter(isChatMessage)
    .slice(-MAX_HISTORY_ITEMS)
    .map((m) => ({ role: m.role, text: m.text.slice(0, MAX_QUESTION_LENGTH) }));

  let bundle = loadPrecachedBundle(ein);
  if (!bundle) {
    try {
      bundle = await buildOrgBundle(ein);
    } catch (err) {
      console.error("[api/charity/chat] upstream fetch failed", err);
      return NextResponse.json({ error: "Could not load organization data" }, { status: 502 });
    }
  }
  if (!bundle) {
    return NextResponse.json({ error: "No financial data found for this organization" }, { status: 404 });
  }

  try {
    const answer = await askAboutCharity(bundle, history, question);
    return NextResponse.json({ answer });
  } catch (err) {
    console.error("[api/charity/chat] chat failed", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    const isConfigError = message.includes("GEMINI_API_KEY");
    return NextResponse.json(
      {
        error: isConfigError
          ? "Chat isn't configured on this deployment (missing API key)."
          : "Couldn't get an answer right now -- try again in a moment.",
      },
      { status: isConfigError ? 501 : 502 },
    );
  }
}
