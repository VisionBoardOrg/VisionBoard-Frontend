import { z } from "zod";

/**
 * Validates that a string is a valid ISO 8601 date (YYYY-MM-DD or full datetime).
 * Rejects strings that produce Invalid Date when parsed by the Date constructor.
 *
 * Use this everywhere user-supplied date strings are accepted to prevent
 * unhandled exceptions from `new Date("garbage")` propagating to Prisma.
 */
export const isoDateString = z
  .string()
  .refine(
    (val) => {
      const d = new Date(val);
      return !isNaN(d.getTime());
    },
    { message: "Invalid date — expected ISO 8601 format (e.g. 2025-06-30)" }
  );

/** Nullable variant — accepts a valid ISO string, null, empty string (""), or undefined */
export const nullableIsoDateString = z.preprocess(
  (val) => (val === "" ? null : val),
  isoDateString.nullable().optional()
);

