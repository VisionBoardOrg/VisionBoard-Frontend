# Security Policy

## Supported Versions

Only the latest commit on the `main` branch receives security fixes.

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Email **security@vision-board.tech** with:

- A description of the vulnerability and its impact
- Steps to reproduce (PoC if available)
- Affected component / file paths

You will receive an acknowledgement within 48 hours and a resolution timeline
within 7 days. We do not currently offer a bug bounty programme but will credit
researchers in release notes unless they request anonymity.

---

## Security Architecture Overview

### Authentication

| Layer | Mechanism |
|---|---|
| User sessions | NextAuth v5 JWT, `httpOnly` + `secure` + `sameSite=lax` cookie |
| Admin panel | HMAC-SHA256 signed session token, `httpOnly` + `secure` + `sameSite=strict`, path-scoped to `/admin` |
| Password hashing | bcrypt, cost factor 12 |
| OAuth | Google OIDC; `allowDangerousEmailAccountLinking` intentionally disabled |

### Authorization

Every API route enforces workspace membership before touching data.
Privileged operations (export, rename, invite, ownership transfer) additionally
require `admin` or `owner` role, enforced via `lib/auth/require-role.ts`.

### AI / LLM Safety

- All database-sourced content (task titles, blocked reasons, document text)
  is sanitized through `lib/ai/prompt-sanitize.ts` before embedding in prompts.
- DB-sourced context is placed in the **user turn** inside a labelled
  `--- BEGIN DATA (UNTRUSTED) ---` block, never in the system prompt position.
- The system prompt explicitly instructs the model to treat the context block
  as untrusted data and not to follow any directives within it.
- AI credit debits use atomic `updateMany` compare-and-swap to prevent
  concurrent requests from racing past the credit limit.

### Rate Limiting

Rate limits use Upstash Redis sliding-window counters shared across all
serverless instances. **`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
are required in production** — the application will refuse to start without them
(enforced by `lib/validate-env.ts`). In development, an in-process `Map` is used
as a fallback with a console warning.

### Cron Jobs

Cron endpoints (`/api/cron/sweeps`, `/api/cron/cleanup-users`) are protected by:

1. A constant-time `CRON_SECRET` token check (required, min 32 chars).
2. An IP allowlist against Vercel Cron's published IP ranges.

Neither check degrades silently — a missing `CRON_SECRET` causes a hard 500
rather than an open endpoint.

### Content Security Policy

The CSP removes `'unsafe-inline'` from `script-src` and uses `'strict-dynamic'`
so Next.js chunk loading works without inline scripts. `style-src` retains
`'unsafe-inline'` (required by Tailwind). All headers are set both in
`next.config.ts` (static routes) and `proxy.ts` (Edge middleware).

### Input Handling

| Vector | Mitigation |
|---|---|
| Comment XSS | `sanitize-html` allowlist applied on create and edit before DB storage |
| Tiptap document XSS | Node-type and attribute allowlist in `lib/validations/tiptap-schema.ts` |
| Open redirect | `lib/safe-redirect.ts` `getSafeCallbackUrl()` used on all login redirects |
| SQL injection | All DB access via Prisma parameterised queries; raw SQL uses tagged template literals |
| File upload | `pdfjs-dist` (replaces `pdf-parse`), `exceljs` (replaces `xlsx`); 10 MB hard cap before parsing |

### Dependency Policy

- `npm run audit:security` runs `npm audit --audit-level=high`.
- Critical / high findings block releases.
- `next-auth` is pinned to a specific beta; migrate to stable Auth.js as soon
  as it is available.
- Open-range `^` versions are used only for non-security-sensitive packages.

---

## Environment Variable Checklist (Production)

The following variables are **required** in production. `lib/validate-env.ts`
will throw at startup if any are missing or set to a known-unsafe default.

| Variable | Purpose | Minimum |
|---|---|---|
| `AUTH_SECRET` | NextAuth JWT signing | 32 chars |
| `ADMIN_SESSION_SECRET` | Admin HMAC cookie signing | 32 chars |
| `ADMIN_PASSWORD` | Admin panel password | 16 chars, not a common default |
| `ADMIN_USERNAME` | Admin panel username | must not be `admin` |
| `CRON_SECRET` | Cron endpoint auth | 32 chars |
| `UPSTASH_REDIS_REST_URL` | Cross-instance rate limits & cron locks | valid URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash auth | non-empty |
| `DATABASE_URL` | Postgres connection | — |
| `STRIPE_SECRET_KEY` | Billing (not the dummy build key) | — |
| `APP_URL` or `NEXTAUTH_URL` | Email link base URL | — |

See `.env.example` for the full list including optional variables.
