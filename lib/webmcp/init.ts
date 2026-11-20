/**
 * lib/webmcp/init.ts
 *
 * Initializes the @mcp-b/webmcp-polyfill so document.modelContext exists in
 * all browsers, not just Chrome 149+. Deferred to browser idle time so the
 * polyfill never competes with initial React hydration or LCP.
 *
 * Safe to import in SSR — initialization only runs in the browser.
 */

export type WebMCPModelContext = {
  registerTool: (tool: unknown, opts?: unknown) => Promise<void>;
};

function readModelContext(): WebMCPModelContext | undefined {
  if (typeof document === "undefined") return undefined;
  return (document as unknown as { modelContext?: WebMCPModelContext }).modelContext;
}

let initPromise: Promise<WebMCPModelContext | undefined> | null = null;

function scheduleIdle(cb: () => void): void {
  const win = window as Window & {
    requestIdleCallback?: (fn: () => void, opts?: { timeout: number }) => number;
  };
  if (typeof win.requestIdleCallback === "function") {
    win.requestIdleCallback(cb, { timeout: 2000 });
  } else {
    setTimeout(cb, 200);
  }
}

/**
 * Returns a single shared Promise that resolves once `document.modelContext`
 * is ready (either natively or via the deferred polyfill). Replaces per-component
 * 100 ms polling loops and keeps polyfill execution off the critical load path.
 */
export function getWebMCPModelContext(): Promise<WebMCPModelContext | undefined> {
  if (typeof window === "undefined") return Promise.resolve(undefined);

  const existing = readModelContext();
  if (existing) return Promise.resolve(existing);

  if (!initPromise) {
    initPromise = new Promise<WebMCPModelContext | undefined>((resolve) => {
      scheduleIdle(() => {
        const nativeMc = readModelContext();
        if (nativeMc) {
          resolve(nativeMc);
          return;
        }
        // Dynamic import keeps the polyfill out of the SSR bundle and off the
        // initial hydration critical path.
        import("@mcp-b/webmcp-polyfill")
          .then(({ initializeWebMCPPolyfill }) => {
            initializeWebMCPPolyfill();
            resolve(readModelContext());
          })
          .catch(() => {
            // Polyfill load failure is non-fatal — native Chrome 149+ support may still work.
            resolve(readModelContext());
          });
      });
    });
  }

  return initPromise;
}

export function initializeWebMCP(): void {
  void getWebMCPModelContext();
}
