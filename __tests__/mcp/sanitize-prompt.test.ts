// Feature: web-mcp-integration, Property 11: sanitizeForPrompt removes control characters
import { describe, it, expect } from "vitest";
import fc from "fast-check";

// sanitizeForPrompt is in lib/ai/prompt-sanitize.ts — import directly
// No server-only guard needed for pure function tests
import { sanitizeForPrompt } from "@/lib/ai/prompt-sanitize";

// Characters that sanitizeForPrompt strips:
//   \x00–\x08, \x0B, \x0C, \x0E–\x1F, \x7F
// Characters that are PRESERVED (not disallowed):
//   \x09 (tab), \x0A (LF), \x0D (CR)
const DISALLOWED_RANGES: [number, number][] = [
  [0x00, 0x08],
  [0x0b, 0x0c],
  [0x0e, 0x1f],
  [0x7f, 0x7f],
];

function containsDisallowed(s: string): boolean {
  for (const char of s) {
    const cp = char.codePointAt(0)!;
    for (const [lo, hi] of DISALLOWED_RANGES) {
      if (cp >= lo && cp <= hi) return true;
    }
  }
  return false;
}

describe("Property 11: sanitizeForPrompt removes disallowed control characters", () => {
  it("output never contains disallowed control characters", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const output = sanitizeForPrompt(input);
        expect(containsDisallowed(output)).toBe(false);
      }),
      { numRuns: 200 }
    );
  });

  it("output length is at most 500 characters", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const output = sanitizeForPrompt(input);
        expect(output.length).toBeLessThanOrEqual(500);
      }),
      { numRuns: 200 }
    );
  });
});
