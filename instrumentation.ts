/**
 * instrumentation.ts — Next.js server instrumentation hook.
 *
 * This file is automatically loaded by Next.js before the application
 * starts serving requests (Node.js runtime only).
 *
 * We use it to run startup validation checks — particularly to verify that
 * all required secrets are properly configured before accepting traffic.
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run in the Node.js server runtime, not in Edge or during builds
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("./lib/validate-env");
    validateEnv();
  }
}
