import { streamText } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * AI writing assistant — streams completions for the editor.
 *
 * Uses Groq via the Vercel AI SDK. Groq's API has a genuinely free tier, so
 * this add-on costs nothing to run (set GROQ_API_KEY from console.groq.com).
 * The model is configurable via GROQ_MODEL.
 *
 * Auth: requires a logged-in user (prevents anonymous abuse of the key). The
 * text to operate on is sent by the client; we cap it to bound token usage.
 */
const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
const MAX_INPUT = 12000; // characters

const PROMPTS: Record<string, (text: string) => string> = {
  improve: (t) =>
    `Rewrite the following text to be clearer and more polished, preserving its meaning and language. Return ONLY the rewritten text.\n\n${t}`,
  grammar: (t) =>
    `Correct the spelling, grammar, and punctuation of the following text. Change nothing else. Return ONLY the corrected text.\n\n${t}`,
  summarize: (t) =>
    `Write a concise summary (2-4 sentences) of the following document. Return ONLY the summary.\n\n${t}`,
  continue: (t) =>
    `Continue writing the following document naturally from where it ends, matching its tone and style. Return ONLY the new continuation text (do not repeat what's already there).\n\n${t}`,
};

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json(
      { error: "AI is not configured (GROQ_API_KEY is unset)." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const { action, text } = (body ?? {}) as { action?: string; text?: string };
  const build = action ? PROMPTS[action] : undefined;
  if (!build || typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json(
      { error: "Provide a known action and non-empty text." },
      { status: 400 },
    );
  }

  const result = streamText({
    model: groq(MODEL),
    system:
      "You are a writing assistant embedded in a document editor. Output ONLY the requested text — no preamble, no explanations, no markdown code fences, no quotes around the result.",
    prompt: build(text.slice(0, MAX_INPUT)),
  });

  return result.toTextStreamResponse();
}
