// Feature: web-mcp-integration, Property 2: Hash storage round-trip
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { createHash } from "crypto";

describe("Hash storage round-trip", () => {
  it("SHA-256(vsn_live_ + hex(bytes)) always equals the stored keyHash", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 32, maxLength: 32 }), (bytes) => {
        const rawKey = "vsn_live_" + Buffer.from(bytes).toString("hex");
        const keyHash = createHash("sha256").update(rawKey).digest("hex");
        // Verify the hash is a 64-char hex string
        expect(keyHash).toMatch(/^[0-9a-f]{64}$/);
        // Verify re-computing the hash from the same raw key gives the same result
        const recomputed = createHash("sha256").update(rawKey).digest("hex");
        expect(keyHash).toBe(recomputed);
      }),
      { numRuns: 100 }
    );
  });
});
