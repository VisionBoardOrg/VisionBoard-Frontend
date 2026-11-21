import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

/**
 * Lean JWT-only NextAuth helper (zero database queries).
 *
 * Uses the exact same secret, session strategy, and cookie configuration as
 * `lib/auth/index.ts` (`authConfig`), but omits the Prisma-backed JWT refresh
 * callback. Use on high-frequency, read-only endpoints (such as
 * `GET /api/notifications`) that only need the authenticated `session.user.id`.
 */
export const { auth: leanAuth } = NextAuth(authConfig);
