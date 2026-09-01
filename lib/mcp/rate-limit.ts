import type { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

export interface McpRateLimitResult {
  allowed: boolean;
  resetSec: number;
  mcpErrorResponse?: {
    jsonrpc: "2.0";
    error: { code: number; message: string };
    id: null;
  };
}

export async function mcpRateLimit(
  keyId: string,
  tier: "general" | "ai",
  req: NextRequest
): Promise<McpRateLimitResult> {
  const config =
    tier === "general"
      ? { windowMs: 15 * 60 * 1000, max: 60 }
      : { windowMs: 15 * 60 * 1000, max: 10 };

  const action = tier === "general" ? `mcp-general-${keyId}` : `mcp-ai-${keyId}`;

  const result = await checkRateLimit(req, action, config);

  if (!result.allowed) {
    const resetSec = result.resetSec ?? 900;
    return {
      allowed: false,
      resetSec,
      mcpErrorResponse: {
        jsonrpc: "2.0",
        error: {
          code: -32429,
          message: `Rate limit exceeded. Retry in ${resetSec} seconds.`,
        },
        id: null,
      },
    };
  }

  return { allowed: true, resetSec: 0 };
}
