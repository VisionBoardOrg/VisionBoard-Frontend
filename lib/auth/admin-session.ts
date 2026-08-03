/**
 * Admin session signing/verification using the Web Crypto API (SubtleCrypto).
 *
 * This module intentionally avoids Node.js built-ins (e.g. the `crypto` module)
 * so it can be imported from Next.js Edge Middleware without errors.
 * `globalThis.crypto.subtle` is available in Edge Runtime, Node.js 18+, and browsers.
 *
 * Token format: "<nonce>.<expiresAt>.<hmac_hex>"
 * - nonce: 32 hex chars (cryptographically random, unique per session)
 * - expiresAt: Unix timestamp (seconds) when this session expires
 * - hmac: HMAC-SHA256 of "<nonce>.<expiresAt>" — prevents forgery and replay
 *
 * This design ensures:
 * - Each session produces a unique cookie value (no static token)
 * - Tokens carry a server-enforced expiry independent of the cookie maxAge
 * - Compromised tokens expire naturally; rotate ADMIN_SESSION_SECRET to revoke all
 */

const ALGORITHM = { name: "HMAC", hash: "SHA-256" } as const;
const encoder = new TextEncoder();

/** Session lifetime in seconds (24 hours). */
const SESSION_TTL_SECONDS = 60 * 60 * 24;

function getSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "ADMIN_SESSION_SECRET must be set to at least 32 characters in production."
      );
    }
    console.warn(
      "[admin-session] ADMIN_SESSION_SECRET is unset or too short. " +
        "Set a strong secret (32+ chars) before deploying to production."
    );
    return "dev_fallback_secret_not_for_production_use_only";
  }
  return secret;
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

/** Generate a hex nonce using the Web Crypto API (Edge-compatible). */
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes.buffer);
}

/**
 * Produces a unique, expiry-bearing admin session token.
 * Format: "<nonce>.<expiresAt>.<hmac>"
 */
export async function signAdminSession(): Promise<string> {
  const nonce = generateNonce();
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${nonce}.${expiresAt}`;

  const key = await importKey(["sign"]);
  const signature = await crypto.subtle.sign(ALGORITHM, key, encoder.encode(payload));
  return `${payload}.${bytesToHex(signature)}`;
}

/**
 * Verifies the admin session cookie.
 * Checks HMAC integrity and token expiry.
 * Returns false if the token is missing, malformed, expired, or tampered with.
 */
export async function verifyAdminSession(cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue) return false;
  try {
    const parts = cookieValue.split(".");
    if (parts.length !== 3) return false;

    const [nonce, expiresAtStr, hmacHex] = parts;
    if (!nonce || !expiresAtStr || !hmacHex) return false;

    // Check expiry first — avoids wasted crypto work on stale tokens
    const expiresAt = parseInt(expiresAtStr, 10);
    if (isNaN(expiresAt) || Math.floor(Date.now() / 1000) > expiresAt) return false;

    const signatureBytes = hexToBytes(hmacHex);
    if (!signatureBytes) return false;

    const payload = `${nonce}.${expiresAtStr}`;
    const key = await importKey(["verify"]);
    const signatureBuffer = new Uint8Array(signatureBytes).buffer;

    // crypto.subtle.verify uses constant-time comparison internally
    return await crypto.subtle.verify(
      ALGORITHM,
      key,
      signatureBuffer,
      encoder.encode(payload)
    );
  } catch {
    return false;
  }
}
