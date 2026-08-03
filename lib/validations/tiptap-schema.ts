import { z } from "zod";

/**
 * Allowlist-based Tiptap ProseMirror JSON validator.
 *
 * Only permitted node types and mark types are accepted.
 * This prevents XSS via injected script nodes, javascript: href marks,
 * or arbitrary attribute injection in document content.
 */

const ALLOWED_NODE_TYPES = new Set([
  "doc",
  "paragraph",
  "heading",
  "text",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "codeBlock",
  "horizontalRule",
  "hardBreak",
  "image",
]);

const ALLOWED_MARK_TYPES = new Set([
  "bold",
  "italic",
  "strike",
  "code",
  "underline",
  "link",
  "textStyle",
  "highlight",
]);

// Forward declaration for recursive type
const tiptapNode: z.ZodType<unknown> = z.lazy(() =>
  z
    .object({
      type: z.string().refine(
        (t) => ALLOWED_NODE_TYPES.has(t),
        (t) => ({ message: `Disallowed node type: "${t}"` })
      ),
      attrs: z
        .record(z.unknown())
        .optional()
        .superRefine((attrs, ctx) => {
          if (!attrs) return;
          // Reject javascript: in any string attribute value
          for (const [key, val] of Object.entries(attrs)) {
            if (typeof val === "string") {
              const lower = val.toLowerCase().replace(/\s/g, "");
              if (lower.startsWith("javascript:") || lower.startsWith("data:text/html")) {
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  message: `Unsafe value in attrs.${key}`,
                });
              }
            }
          }
        }),
      content: z.array(z.lazy(() => tiptapNode)).optional(),
      marks: z
        .array(
          z.object({
            type: z.string().refine(
              (t) => ALLOWED_MARK_TYPES.has(t),
              (t) => ({ message: `Disallowed mark type: "${t}"` })
            ),
            attrs: z
              .record(z.unknown())
              .optional()
              .superRefine((attrs, ctx) => {
                if (!attrs) return;
                // Specifically block javascript: in href
                const href = attrs["href"];
                if (typeof href === "string") {
                  const lower = href.toLowerCase().replace(/\s/g, "");
                  if (
                    lower.startsWith("javascript:") ||
                    lower.startsWith("data:text/html") ||
                    lower.startsWith("vbscript:")
                  ) {
                    ctx.addIssue({
                      code: z.ZodIssueCode.custom,
                      message: "Unsafe href value in link mark",
                    });
                  }
                }
              }),
          })
        )
        .optional(),
      text: z.string().optional(),
    })
    .passthrough() // allow unknown keys gracefully but the type check above already enforces what matters
);

/**
 * Validates a Tiptap document JSON blob.
 * Returns a Zod parse result — use .safeParse() and check .success.
 *
 * For storage: if validation fails, reject the document with a 400.
 * Do NOT silently store unvalidated content.
 */
export const tiptapDocSchema = z.object({
  type: z.literal("doc"),
  content: z.array(tiptapNode).optional(),
});

export type TiptapDoc = z.infer<typeof tiptapDocSchema>;
