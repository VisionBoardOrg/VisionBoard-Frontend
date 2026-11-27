/**
 * Trusted Types helper & fallback tinyfill per modern-web-guidance `trusted-types`.
 * Creates a default HTML/Script/ScriptURL policy with a cross-browser fallback
 * when `window.trustedTypes` is not natively supported.
 */

export interface TrustedTypePolicyLike {
  createHTML(input: string): string;
  createScript(input: string): string;
  createScriptURL(input: string): string;
}

interface WindowWithTrustedTypes {
  trustedTypes?: {
    createPolicy(
      name: string,
      rules: {
        createHTML?: (s: string) => string;
        createScript?: (s: string) => string;
        createScriptURL?: (s: string) => string;
      }
    ): TrustedTypePolicyLike;
    defaultPolicy?: TrustedTypePolicyLike | null;
  };
}

let cachedPolicy: TrustedTypePolicyLike | null = null;

export function getTrustedTypesPolicy(): TrustedTypePolicyLike {
  if (cachedPolicy) return cachedPolicy;

  const g = globalThis as unknown as WindowWithTrustedTypes;
  if (typeof window !== "undefined" && !g.trustedTypes) {
    g.trustedTypes = {
      createPolicy: (_name, rules) => ({
        createHTML: (s: string) => (rules.createHTML ? rules.createHTML(s) : s),
        createScript: (s: string) => (rules.createScript ? rules.createScript(s) : s),
        createScriptURL: (s: string) => (rules.createScriptURL ? rules.createScriptURL(s) : s),
      }),
    };
  }

  const rules = {
    createHTML: (input: string) => input,
    createScript: (input: string) => input,
    createScriptURL: (input: string) => {
      const parsed = new URL(input, typeof location !== "undefined" ? location.origin : "https://vision-board.tech");
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new TypeError(`Blocked untrusted script URL protocol: ${parsed.protocol}`);
      }
      return parsed.href;
    },
  };

  if (g.trustedTypes) {
    try {
      cachedPolicy = g.trustedTypes.createPolicy("visionboard#html", rules);
      return cachedPolicy;
    } catch {
      // Fallback if policy already exists
    }
  }

  cachedPolicy = rules;
  return cachedPolicy;
}

export function createTrustedJsonLd(data: unknown): string {
  const raw = JSON.stringify(data).replace(/</g, "\\u003c");
  return getTrustedTypesPolicy().createHTML(raw) as unknown as string;
}
