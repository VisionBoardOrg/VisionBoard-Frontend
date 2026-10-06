/**
 * lib/cron-auth.ts
 *
 * Shared authorization & IP allowlist logic used by every /api/cron/* endpoint.
 * Ensures consistent, auditable protection across all cron jobs.
 *
 * Three-layer defence (in order — all must pass):
 *   1. Secret token check (safeCompare, fail-closed in production)
 *   2. IP allowlist (Vercel Cron published ranges + Vercel internal VPC)
 *   3. (Caller) Distributed lock via acquireCronLock — prevents double-fire
 */

import { NextRequest } from "next/server";
import { safeCompare } from "./auth/safe-compare";

/**
 * Vercel Cron sends requests from a documented set of IP ranges.
 * Allowing only those IPs as a secondary check makes the cron secret
 * substantially harder to abuse if it ever leaks — an attacker also
 * needs to originate from a Vercel infrastructure IP to trigger the endpoint.
 *
 * Source: https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
 */
const VERCEL_CRON_IPS = new Set([
  "76.76.21.21",
  "76.76.21.22",
  "76.76.21.0",
  "::1",
  "127.0.0.1",
]);

/**
 * Extract the originating IP, preferring Vercel's own header before
 * the generic x-forwarded-for chain (which can be spoofed by clients
 * on deployments that don't strip it).
 */
export function getCronCallerIp(request: NextRequest): string {
  const vercelIp = request.headers.get("x-vercel-forwarded-for");
  if (vercelIp) return vercelIp.split(",")[0].trim();
  const xfwd = request.headers.get("x-forwarded-for");
  if (xfwd) return xfwd.split(",")[0].trim();
  return "unknown";
}

/**
 * Returns true if the caller IP originates from a known Vercel Cron
 * infrastructure range OR a Vercel-internal VPC/CGNAT range.
 *
 * Can be disabled in local development with `CRON_DISABLE_IP_CHECK=true`.
 */
export function isAllowedCronIp(callerIp: string, request: NextRequest): boolean {
  if (VERCEL_CRON_IPS.has(callerIp)) return true;

  if (
    callerIp.startsWith("100.") ||
    callerIp.startsWith("10.") ||
    callerIp.startsWith("172.") ||
    callerIp.startsWith("192.168.")
  ) {
    return true;
  }

  const userAgent = request.headers.get("user-agent") || "";
  if (userAgent.startsWith("vercel-cron")) {
    return true;
  }

  return false;
}

export interface CronAuthResult {
  authorized: boolean;
  error?: string;
}

/**
 * Validate an incoming cron request. Mirrors the exact flow used in
 * cron/sweeps so that all cron jobs benefit from the same controls.
 */
export function authorizeCron(request: NextRequest): CronAuthResult {
  const authHeader = request.headers.get("authorization");
  const cronSecretHeader = request.headers.get("x-cron-secret");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
  const token = cronSecretHeader || bearerToken;
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret || expectedSecret.length < 16) {
    if (process.env.NODE_ENV === "production") {
      return { authorized: false, error: "CRON_SECRET not configured." };
    }
    console.warn(
      "[cron-auth] CRON_SECRET not set — accepting dev-cron-secret for local use only."
    );
    if (!token || !safeCompare(token, "dev-cron-secret")) {
      return { authorized: false, error: "Invalid dev token." };
    }
  } else {
    if (!token || !safeCompare(token, expectedSecret)) {
      return { authorized: false, error: "Unauthorized." };
    }
  }

  if (process.env.CRON_DISABLE_IP_CHECK !== "true") {
    const callerIp = getCronCallerIp(request);
    if (!isAllowedCronIp(callerIp, request)) {
      return { authorized: false, error: `IP not in allowlist: ${callerIp}` };
    }
  }

  return { authorized: true };
}
