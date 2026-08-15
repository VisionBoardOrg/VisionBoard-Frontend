/**
 * lib/auth/index.ts — Full NextAuth configuration for Node.js contexts.
 *
 * This file imports Prisma, bcryptjs, and the PrismaAdapter.
 * It must NEVER be imported from proxy.ts (middleware/Edge Runtime).
 * Middleware uses the lean auth.config.ts instead.
 *
 * ⚠️  DEPENDENCY RISK — next-auth v5 beta
 * The project currently uses next-auth@5.0.0-beta.32, which is a pre-release.
 * Beta packages may contain unresolved CVEs or breaking API changes.
 * Action items:
 *   1. Monitor https://github.com/nextauthjs/next-auth/releases for stable v5.
 *   2. Run `npm audit` regularly to catch any published vulnerabilities.
 *   3. Migrate to the stable release as soon as it is available.
 *   4. Do NOT upgrade using `^` ranges until stable — pin to a known-good beta.
 */

import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { authConfig } from "@/auth.config";
import { cache } from "react";

/**
 * Deduplicate workspace membership queries within a single request lifecycle (RSC / Server Components / layout + page).
 * Prevents multiple parallel auth() calls in layout + page + metadata from spamming the Prisma connection pool.
 */
const getWorkspaceMembership = cache((userId: string) =>
  prisma.workspaceMember.findFirst({
    where: { userId },
    include: { workspace: true },
    orderBy: { joinedAt: "asc" },
  })
);

const loginSchema = z.object({
  email: z.string().email(),
  // Match the registration minimum — shorter values can never be valid credentials
  password: z.string().min(12),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // allowDangerousEmailAccountLinking is intentionally NOT set — enabling it
      // allows account takeover by anyone who can register a Google account with
      // the same email as an existing credentials user.
    }),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });
        if (!user?.hashedPassword) return null;

        const valid = await bcrypt.compare(parsed.data.password, user.hashedPassword);
        if (!valid) return null;

        if (user.scheduledDeletion) {
          throw new Error(`ACCOUNT_DELETION_SCHEDULED:${user.email}`);
        }

        return user;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user && user.id) {
        token.id = user.id;
        // Clear cached workspace data on fresh sign-in so it re-fetches below
        token.workspaceId         = null;
        token.role                = null;
        token.workspacePlan       = null;
        token.membershipFetchedAt = undefined;
      }

      // Re-fetch workspace membership from DB:
      // - On initial sign-in (fields not yet populated)
      // - On explicit session update trigger (e.g. after workspace creation)
      // - Every 5 minutes to pick up role changes or membership removal
      //
      // This callback runs ONLY in Node.js context (API routes, RSC pages).
      // Middleware uses the lean authConfig whose jwt() callback never touches Prisma.
      const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
      const now       = Date.now();
      const lastFetch = (token.membershipFetchedAt as number | undefined) ?? 0;
      // Refresh workspace membership only on explicit trigger, initial login (lastFetch === 0),
      // or after 5 minutes — avoiding redundant DB queries on every request when workspaceId is null.
      const needsRefresh =
        trigger === "update" ||
        (token.workspaceId === null && lastFetch === 0) ||
        (lastFetch > 0 && now - lastFetch > REFRESH_INTERVAL_MS);

      if (token.id && needsRefresh) {
        try {
          const membership = await getWorkspaceMembership(token.id as string);
          token.role                = membership?.role            ?? null;
          token.workspaceId         = membership?.workspaceId     ?? null;
          token.workspacePlan       = membership?.workspace?.plan ?? null;
          token.membershipFetchedAt = now;
        } catch (error) {
          console.error("[auth] Failed to fetch workspace membership:", error);
        }
      }

      return token;
    },
    async session({ session, token }) {
      session.user.id            = token.id            as string;
      session.user.role          = token.role          as string | null;
      session.user.workspaceId   = token.workspaceId   as string | null;
      session.user.workspacePlan = token.workspacePlan as string | null;
      return session;
    },
  },
});
