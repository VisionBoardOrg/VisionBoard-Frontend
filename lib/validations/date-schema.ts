import { z } from "zod";

/**
 * ISO 8601 date/datetime validator.
 *
 * Accepts:
 *   YYYY-MM-DD                          (date-only)
 *   YYYY-MM-DDTHH:MM:SS                 (local datetime, no timezone)
 *   YYYY-MM-DDTHH:MM:SSZ                (UTC)
 *   YYYY-MM-DDTHH:MM:SS.sssZ            (UTC with milliseconds)
 *   YYYY-MM-DDTHH:MM:SS+HH:MM           (offset)
 *   YYYY-MM-DDTHH:MM:SS.sss+HH:MM       (offset with milliseconds)
 *
 * Rejects everything `new Date()` accepts that isn't ISO 8601:
 *   "Tuesday", "Jan 1, 2025", "0", whitespace-padded strings, etc.
 *
 * Use this everywhere user-supplied date strings are accepted to prevent
 * unhandled exceptions from `new Date("garbage")` propagating to Prisma.
 */

const ISO_8601_RE =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/;

export const isoDateString = z
  .string()
  .refine(
    (val) => {
      if (!ISO_8601_RE.test(val)) return false;
      // Let the Date constructor do the calendar sanity check (e.g. month 13,
      // day 32) after the regex confirms the format is correct.
      const d = new Date(val);
      return !isNaN(d.getTime());
    },
    { message: "Invalid date — expected ISO 8601 format (e.g. 2025-06-30 or 2025-06-30T14:00:00Z)" }
  );

/** Nullable variant — accepts a valid ISO string, null, empty string (""), or undefined */
export const nullableIsoDateString = z.preprocess(
  (val) => (val === "" ? null : val),
  isoDateString.nullable().optional()
);

