import { PrismaClient } from "@prisma/client";
// Prevent this module from ever being imported in client bundles.
// Any accidental client-side import will throw a build error.
import "server-only";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

// Always store on globalThis so lambdas reuse the client and its connection pool
globalForPrisma.prisma = prisma;


