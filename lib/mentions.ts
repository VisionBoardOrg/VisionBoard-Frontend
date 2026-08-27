import { prisma } from "@/lib/prisma";

export interface ResolvedMention {
  handle: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
}

/**
 * Extract distinct @mention handles from plaintext or markdown content.
 * Matches patterns like @john, @john.doe, @sarah_connor, @alex-dev.
 */
export function extractMentions(text: string): string[] {
  if (!text || typeof text !== "string") return [];

  // Match @handle where handle starts with alphanumeric and can contain dots, hyphens, underscores
  const regex = /(?:^|[\s(])@([a-zA-Z0-9][a-zA-Z0-9._-]*)/g;
  const matches = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const handle = match[1].toLowerCase().trim();
    // Exclude trailing punctuation often caught in sentences like "@john." or "@sarah,"
    const cleanHandle = handle.replace(/[.,;:!?]+$/, "");
    if (cleanHandle.length > 0) {
      matches.add(cleanHandle);
    }
  }

  return Array.from(matches);
}

/**
 * Normalize strings for fuzzy handle-to-name matching (removes spaces, punctuation).
 */
function normalizeForMatch(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Resolve extracted mention handles against members of a specific workspace.
 * Matches against:
 * 1. Email username prefix (e.g. "alex.dev" from "alex.dev@company.com")
 * 2. Full name normalized (e.g. "alexsmith" from "Alex Smith")
 * 3. First name (e.g. "alex" from "Alex Smith")
 */
export async function resolveMentions(
  text: string,
  workspaceId: string
): Promise<ResolvedMention[]> {
  const handles = extractMentions(text);
  if (handles.length === 0) return [];

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
    },
  });

  const resolved: ResolvedMention[] = [];
  const matchedUserIds = new Set<string>();

  for (const handle of handles) {
    const normHandle = normalizeForMatch(handle);

    for (const member of members) {
      const user = member.user;
      if (!user) continue;

      const emailPrefix = user.email ? user.email.split("@")[0].toLowerCase() : "";
      const normEmailPrefix = normalizeForMatch(emailPrefix);
      const name = user.name ? user.name.toLowerCase() : "";
      const normName = normalizeForMatch(name);
      const firstName = user.name ? user.name.split(" ")[0].toLowerCase() : "";
      const normFirstName = normalizeForMatch(firstName);

      const isMatch =
        normHandle === normEmailPrefix ||
        normHandle === normName ||
        (normHandle === normFirstName && normFirstName.length >= 3) ||
        handle.toLowerCase() === emailPrefix;

      if (isMatch && !matchedUserIds.has(user.id)) {
        matchedUserIds.add(user.id);
        resolved.push({
          handle,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
          },
        });
        break;
      }
    }
  }

  return resolved;
}
