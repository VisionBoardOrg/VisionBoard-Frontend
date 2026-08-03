/**
 * auth.config.ts — Edge-compatible NextAuth configuration.
 *
 * This file intentionally contains NO imports of Prisma, bcryptjs, or any
 * other Node.js-only module. It is imported by proxy.ts (middleware) which
 * runs in the Edge Runtime where those modules are unavailable.
 *
 * The full auth configuration (with Prisma adapter, credentials provider, and
 * JWT membership fetch) lives in lib/auth/index.ts and is used by all
 * Node.js contexts (API routes, RSC pages, server actions).
 */

import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/auth/login",
    error: "/auth/error",
  },
  providers: [
    // Providers are intentionally empty here.
    // The real providers (Google, Credentials) are registered in lib/auth/index.ts.
    // NextAuth only needs the session strategy + pages config to verify the JWT
    // cookie in middleware — it does not need providers for that check.
  ],
  callbacks: {
    // Minimal JWT callback — only reads existing token fields, never calls Prisma.
    jwt({ token }) {
      return token;
    },
    session({ session, token }) {
      session.user.id            = token.id            as string;
      session.user.role          = token.role          as string | null;
      session.user.workspaceId   = token.workspaceId   as string | null;
      session.user.workspacePlan = token.workspacePlan as string | null;
      return session;
    },
  },
};
