/**
 * lib/ai/prompt-sanitize.ts — Sanitize user-controlled and DB-sourced content
 * before it is embedded in LLM prompts.
 *
 * SECURITY: Prompt injection attacks work by embedding instruction-like text
 * inside data that the LLM treats as trusted context. This module:
 *   1. Strips control characters that have no legitimate use in data fields.
 *   2. Limits individual field length so no single value can crowd out the
 *      system instructions with adversarial content.
 *   3. Wraps injected context in a clearly delimited DATA block so the model
 *      understands it is untrusted input, not authoritative instructions.
 *
 * Usage:
 *   import { sanitizeForPrompt, wrapContextBlock } from "@/lib/ai/prompt-sanitize";
 *   const safe = sanitizeForPrompt(userSuppliedString);
 *   const block = wrapContextBlock("Workspace Tasks", rows.map(r => sanitizeForPrompt(r.title)));
 */

/** Maximum characters allowed for any single field embedded in a prompt. */
const MAX_FIELD_LENGTH = 500;

/**
 * Sanitize a single string value before embedding it in an LLM prompt.
 *
 * - Trims leading/trailing whitespace.
 * - Removes null bytes and other ASCII control characters (0x00–0x1F, 0x7F)
 *   except for tab (0x09), newline (0x0A), and carriage return (0x0D).
 * - Truncates to MAX_FIELD_LENGTH characters.
 *
 * Does NOT HTML-encode — the output is for an LLM plaintext prompt, not HTML.
 */
export function sanitizeForPrompt(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // strip control chars
    .trim()
    .slice(0, MAX_FIELD_LENGTH);
}

/**
 * Wrap an array of lines in a clearly labelled DATA block.
 *
 * The surrounding markers tell the LLM that everything between them is
 * untrusted user/workspace data — not system instructions. This does not
 * fully prevent a sophisticated injection but raises the bar significantly.
 */
export function wrapContextBlock(label: string, lines: string[]): string {
  const body = lines.join("\n");
  return `--- BEGIN ${label.toUpperCase()} DATA (UNTRUSTED) ---\n${body}\n--- END ${label.toUpperCase()} DATA ---`;
}
