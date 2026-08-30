/**
 * lib/deletion-token.ts — Signed, time-limited cancel-deletion tokens.
 *
 * Replaces the raw email address that was previously embedded in the
 * cancel-deletion link.  A raw email lets anyone who knows the address
 * silently prevent a user from deleting their own account (GDPR right-to-
 * erasure violation).  A signed token ties the link to a specific user ID
 * and carries a server-enforced expiry.
 *
 * Token format: "<userId>.<expiresAt>.<hmac_hex>"
 *   - userId:    the target user's Prisma ID
 *   - expiresAt: Unix timestamp (seconds) — link valid for TOKEN_TTL_SECONDS
 *   - hmac:      HMAC-SHA256 of "<userId>.<expiresAt>" under AUTH_SECRET
 *
 * Uses the Web Crypto API (globalThis.crypto.subtle) so it is safe to import
 * in both Node.js and Edge Runtime.
 *
 * Key: reuses AUTH_SECRET so no new env var is required.  The token namespace
 * ("cdel") is included in the signed payload to prevent cross-purpose token
 * reuse (e.g. a password-reset token cannot be used as a cancel-deletion token).
 */

const ALGORITHM = { name: "HMAC", hash: "SHA-256" } as const;
const encoder = new TextEncoder();

/** Cancel-deletion links expire after 7 days — matches the warning email cadence. */
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Namespace prefix included in the signed payload to prevent cross-type token reuse. */
const NAMESPACE = "cdel";

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.trim().length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[deletion-token] AUTH_SECRET must be set to at least 32 characters in production."
      );
    }
    // Dev-only fallback — tokens generated with this key are not secure.
    return "dev_fallback_not_for_production_auth_secret_placeholder";
  }
  return secret.trim();
}

async function importKey(usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    ALGORITHM,
    /* extractable */ false,
    usages
  );
}

function bytesToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.slice(i, i + 2), 16);
    if (isNaN(byte)) return null;
    bytes[i / 2] = byte;
  }
  return bytes;
}

/**
 * Sign a cancel-deletion token for the given userId.
 * Returns an opaque string safe for embedding in a URL query parameter.
 */
export async function signCancelDeletionToken(userId: string): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload = `${NAMESPACE}.${userId}.${expiresAt}`;
  const key = await importKey(["sign"]);
  const signature = await crypto.subtle.sign(ALGORITHM, key, encoder.encode(payload));
  // Encode as base64url so the token is URL-safe without further encoding
  const sigBase64 = bytesToHex(signature);
  // Return as "<userId>.<expiresAt>.<hmac>" for easy splitting on verification
  return `${userId}.${expiresAt}.${sigBase64}`;
}

/**
 * Verify a cancel-deletion token.
 * Returns the userId if the token is valid, unexpired, and untampered.
 * Returns null for any invalid, expired, or malformed token.
 */
export async function verifyCancelDeletionToken(token: string): Promise<string | null> {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [userId, expiresAtStr, hmacHex] = parts;
    if (!userId || !expiresAtStr || !hmacHex) return null;

    // Check expiry before doing any crypto work
    const expiresAt = parseInt(expiresAtStr, 10);
    if (isNaN(expiresAt) || Math.floor(Date.now() / 1000) > expiresAt) return null;

    const signatureBytes = hexToBytes(hmacHex);
    if (!signatureBytes) return null;

    // Reconstruct the payload that was originally signed (must include namespace)
    const payload = `${NAMESPACE}.${userId}.${expiresAtStr}`;
    const key = await importKey(["verify"]);

    // crypto.subtle.verify performs constant-time comparison internally
    const valid = await crypto.subtle.verify(
      ALGORITHM,
      key,
      signatureBytes.buffer as ArrayBuffer,
      encoder.encode(payload)
    );

    return valid ? userId : null;
  } catch {
    return null;
  }
}
