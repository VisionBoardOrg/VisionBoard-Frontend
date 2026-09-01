// Feature: web-mcp-integration, Property 1: API key format invariant
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { randomBytes } from "crypto";

function generateRawKey(): string {
  return "vsn_live_" + randomBytes(32).toString("hex");
}

describe("API key format invariant", () => {
  it("always produces a 73-char key matching /^vsn_live_[0-9a-f]{64}$/", () => {
    fc.assert(
      fc.property(fc.nat(), () => {
        const raw = generateRawKey();
        expect(raw).toMatch(/^vsn_live_[0-9a-f]{64}$/);
        expect(raw.length).toBe(73);
      }),
      { numRuns: 100 }
    );
  });
});
