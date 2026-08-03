/**
 * Validates a callbackUrl to ensure it is a safe relative path within this app.
 *
 * Rejects:
 * - Absolute URLs (contain "://")
 * - Protocol-relative URLs (start with "//")
 * - URLs with unexpected characters that could be part of an injection
 *
 * Returns the validated path, or the fallback if the input is unsafe.
 */
export function getSafeCallbackUrl(
  raw: string | null | undefined,
  fallback = "/dashboard"
): string {
  if (!raw) return fallback;

  // Must start with a single "/" but NOT "//" (protocol-relative)
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;

  // Must not contain "://" anywhere (catches embedded absolute URLs)
  if (raw.includes("://")) return fallback;

  // Must not contain backslashes (Windows-style path confusion)
  if (raw.includes("\\")) return fallback;

  // Limit length to prevent log injection or other abuse
  if (raw.length > 512) return fallback;

  return raw;
}
