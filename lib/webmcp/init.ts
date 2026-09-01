/**
 * lib/webmcp/init.ts
 *
 * Initializes the @mcp-b/webmcp-polyfill so document.modelContext exists in
 * all browsers, not just Chrome 149+. Call this once at the top of the
 * workspace client component tree before any WebMCP tools mount.
 *
 * Safe to import in SSR — the actual initialization only runs in the browser.
 */

let initialized = false;

export function initializeWebMCP(): void {
  if (typeof window === "undefined") return;
  if (initialized) return;
  initialized = true;

  // Dynamic import keeps the polyfill out of the SSR bundle entirely.
  // @mcp-b/webmcp-polyfill installs document.modelContext if it is absent.
  import("@mcp-b/webmcp-polyfill")
    .then(({ initializeWebMCPPolyfill }) => {
      initializeWebMCPPolyfill();
    })
    .catch(() => {
      // Polyfill load failure is non-fatal — native Chrome 149+ support may still work.
    });
}
