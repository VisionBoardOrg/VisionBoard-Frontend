import "server-only";

import OpenAI from "openai";

const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct";
const DEFAULT_TIMEOUT_MS = 45_000;

const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || "",
});

export interface OpenRouterCallOptions {
  /** Defaults to `process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct"` */
  model?: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  maxTokens: number;
  /** Defaults to 45_000 ms */
  timeoutMs?: number;
}

export interface OpenRouterResult {
  /** Cleaned response text (think-blocks and JSON fences stripped, whitespace trimmed) */
  text: string;
  /** prompt_tokens + completion_tokens from the API response */
  tokensUsed: number;
}

export class EmptyResponseError extends Error {
  constructor() {
    super("LLM returned an empty or too-short response");
    this.name = "EmptyResponseError";
  }
}

/**
 * Shared non-streaming OpenRouter call helper.
 *
 * - Applies an AbortController timeout (default 45 s).
 * - Strips `<think>…</think>` chain-of-thought blocks.
 * - Removes ` ```json ` / ` ``` ` wrapper fences.
 * - Does NOT throw EmptyResponseError — callers decide (check `text.length < 20`).
 * - Throws a clear message on timeout (AbortError); re-throws all other errors as-is.
 */
export async function callOpenRouter(
  opts: OpenRouterCallOptions
): Promise<OpenRouterResult> {
  const {
    model = DEFAULT_MODEL,
    messages,
    maxTokens,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = opts;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await openrouter.chat.completions.create(
      {
        model,
        messages,
        max_tokens: maxTokens,
        stream: false,
      },
      { signal: controller.signal }
    );

    const raw = response.choices[0]?.message?.content ?? "";

    // Strip <think>…</think> reasoning blocks emitted by some models
    const withoutThink = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

    // Remove JSON code fences if the model wrapped the output
    const cleaned = withoutThink
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();

    const tokensUsed =
      (response.usage?.prompt_tokens ?? 0) +
      (response.usage?.completion_tokens ?? 0);

    return { text: cleaned, tokensUsed };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`OpenRouter request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
