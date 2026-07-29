/**
 * Admin session signing/verification using the Web Crypto API (SubtleCrypto).
 *
 * This module intentionally avoids Node.js built-ins (e.g. the `crypto` module)
 * so it can be imported from Next.js Edge Middleware without errors.
 * `globalThis.crypto.subtle` is available in Edge Runtime, Node.js 18+, and browsers.
 */

const ALGORITHM = { name: "HMAC", hash: "SHA-256" } as const;
const SESSION_VALUE = "admin:authenticated";
const encoder = new TextEncoder();

function getSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "ADMIN_SESSION_SECRET must be set to at least 32 characters in production."
      );
    }
    // Warn loudly in dev but don't crash the server
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

/**
 * Produces an HMAC-SHA256 hex signature of the session payload.
 * This is what gets stored in the admin_session cookie — never the raw secret.
 */
export async function signAdminSession(): Promise<string> {
  const key = await importKey(["sign"]);
  const signature = await crypto.subtle.sign(ALGORITHM, key, encoder.encode(SESSION_VALUE));
  return bytesToHex(signature);
}

/**
 * Verifies that the provided cookie value is a valid HMAC-SHA256 signature.
 * `crypto.subtle.verify` performs constant-time comparison internally,
 * making this resistant to timing attacks.
 */
export async function verifyAdminSession(cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue) return false;
  try {
    const signatureBytes = hexToBytes(cookieValue);
    if (!signatureBytes) return false;

    const key = await importKey(["verify"]);
    // Copy into a fresh Uint8Array to guarantee a plain ArrayBuffer backing
    // (TypeScript requires BufferSource, which excludes SharedArrayBuffer)
    const signatureBuffer = new Uint8Array(signatureBytes).buffer;
    return await crypto.subtle.verify(
      ALGORITHM,
      key,
      signatureBuffer,
      encoder.encode(SESSION_VALUE)
    );
  } catch {
    return false;
  }
}
