/**
 * lib/validate-env.ts
 *
 * Startup secrets validator — call this once at server boot (e.g. from
 * instrumentation.ts) to catch misconfigured secrets before the app
 * starts serving traffic.
 *
 * Checks:
 *  1. Required env vars are present and non-empty.
 *  2. Secrets meet a minimum entropy threshold (length).
 *  3. Admin credentials are not set to known unsafe defaults.
 *
 * Throws in production; warns in development so local dev stays frictionless.
 */

interface EnvCheck {
  key: string;
  minLength?: number;
  disallowedValues?: string[];
  description: string;
}

const REQUIRED_SECRETS: EnvCheck[] = [
  {
    key: "AUTH_SECRET",
    minLength: 32,
    description: "NextAuth JWT signing secret (generate: openssl rand -base64 32)",
  },
  {
    key: "ADMIN_SESSION_SECRET",
    minLength: 32,
    description: "Admin session HMAC key (generate: openssl rand -base64 32)",
  },
  {
    key: "ADMIN_PASSWORD",
    minLength: 16,
    disallowedValues: [
      "change_me_before_deploying",
      "admin",
      "password",
      "changeme",
      "secret",
      "replace_me",
      "admin123",
      "123456",
    ],
    description: "Admin panel password — must be unique and not a known default",
  },
  {
    key: "DATABASE_URL",
    minLength: 10,
    description: "PostgreSQL connection string",
  },
];

function fail(message: string): never {
  throw new Error(`[validate-env] ${message}`);
}

function warn(message: string): void {
  console.warn(`\x1b[33m[validate-env] WARNING: ${message}\x1b[0m`);
}

export function validateEnv(): void {
  const isProd = process.env.NODE_ENV === "production";
  const report = (msg: string) => (isProd ? fail(msg) : warn(msg));

  for (const check of REQUIRED_SECRETS) {
    const value = process.env[check.key];

    if (!value || value.trim() === "") {
      report(
        `${check.key} is not set. ${check.description}`
      );
      continue;
    }

    if (check.minLength && value.trim().length < check.minLength) {
      report(
        `${check.key} is too short (${value.trim().length} chars, minimum ${check.minLength}). ${check.description}`
      );
    }

    if (check.disallowedValues) {
      const normalized = value.trim().toLowerCase();
      if (check.disallowedValues.some((d) => normalized === d.toLowerCase())) {
        report(
          `${check.key} is set to a known unsafe default value "${value.trim()}". ` +
            `Change it before deploying. ${check.description}`
        );
      }
    }
  }

  // Warn if NEXTAUTH_URL / APP_URL is missing — affects email link generation
  if (!process.env.NEXTAUTH_URL && !process.env.APP_URL) {
    warn(
      "Neither NEXTAUTH_URL nor APP_URL is set. Password reset and invite email " +
        "links will fall back to http://localhost:3000 which is wrong in production."
    );
  }

  if (isProd) {
    console.log("[validate-env] All required secrets validated ✓");
  }
}
