# Email Notification Engine — Configuration & Deployment Guide

This document covers configuration, provider integration, deliverability standards (SPF/DKIM/DMARC), and operational details for VisionBoard's email notification system.

---

## 1. Architecture Overview

VisionBoard uses an asynchronous, multi-channel notification pipeline:

1. **Trigger**: An action (e.g. comment `@mention`, task assignment, milestone slippage, billing event) invokes `createNotification()` in `lib/notifications.ts`.
2. **In-App Commit**: The notification is persisted in PostgreSQL via Prisma, and an SSE event is emitted immediately to connected clients.
3. **Async Email Dispatch**:
   - In a non-blocking background promise (`dispatchNotificationEmailAsync`), recipient preferences are verified.
   - If the user has emails enabled for that category, the template is rendered into HTML and multi-part plain text.
   - The email is transmitted through the configured provider with automated exponential backoff retries for transient errors.
   - **Zero Disruption**: If email transmission fails or encounters a timeout, the in-app notification remains completely intact.

---

## 2. Supported Email Providers

### Primary: Resend API
[Resend](https://resend.com) is the primary transactional email service.

- Set the `RESEND_API_KEY` environment variable.
- Configure `EMAIL_FROM` to a verified domain (e.g., `VisionBoard <notifications@yourdomain.com>`).

### Fallback: Nodemailer SMTP
If you are running on custom infrastructure or prefer an on-premise mail server:

- Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and optional `SMTP_SECURE=true`.

### Local Development / Test Mock
If neither `RESEND_API_KEY` nor `SMTP_HOST` is set, emails automatically route to a development console logger (`provider: "console"`), simulating delivery without external dependencies.

---

## 3. Environment Variables Reference

Add the following keys to your `.env` or deployment secrets:

| Variable | Required | Default | Description |
| :--- | :---: | :--- | :--- |
| `RESEND_API_KEY` | Recommended | `""` | API key from Resend dashboard (`re_...`). |
| `EMAIL_FROM` | Optional | `VisionBoard <notifications@resend.dev>` | Outgoing sender address (must match verified domain in production). |
| `NEXT_PUBLIC_APP_URL` | Required | `https://vision-board.tech` | Base application URL used for deep links and unsubscribe endpoints. |
| `SMTP_HOST` | Optional | `""` | Hostname of SMTP server (e.g., `smtp.mailgun.org` or `smtp.sendgrid.net`). |
| `SMTP_PORT` | Optional | `587` | Port for SMTP connections (587 for TLS, 465 for SSL). |
| `SMTP_USER` | Optional | `""` | SMTP authentication username. |
| `SMTP_PASS` | Optional | `""` | SMTP authentication password. |
| `SMTP_SECURE` | Optional | `false` | Set to `true` if connecting via port 465 (SSL). |

---

## 4. Email Standards & Deliverability Compliance

To guarantee high deliverability and avoid spam filters in Gmail, Outlook, and Yahoo, set up the following DNS records for your sending domain:

### A. SPF (Sender Policy Framework)
Add a `TXT` record at your domain root (`@`):
```text
v=spf1 include:amazonses.com ~all
```
*(Replace or append Resend's required include statement as specified in your Resend domain settings).*

### B. DKIM (DomainKeys Identified Mail)
Resend generates 3 dedicated `CNAME` records during domain verification:
```text
resend._domainkey.yourdomain.com  ->  feedback-smtp.us-east-1.amazonses.com
```
Ensure all DKIM records are verified and active in your DNS manager.

### C. DMARC (Domain-based Message Authentication, Reporting, and Conformance)
Add a `TXT` record at `_dmarc.yourdomain.com`:
```text
v=DMARC1; p=reject; pct=100; rua=mailto:dmarc-reports@yourdomain.com
```
- For initial deployment, use `p=none` to monitor deliverability reports without rejecting messages, then escalate to `p=quarantine` or `p=reject`.

### D. RFC 8058 One-Click Unsubscribe
VisionBoard automatically includes RFC 8058 compliance headers in every outgoing notification email:
```http
List-Unsubscribe: <https://vision-board.tech/api/notifications/unsubscribe?token=clx...>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```
This enables native "Unsubscribe" buttons in Gmail and Yahoo mail headers and ensures compliance with modern email deliverability rules.

---

## 5. User Preferences & 1-Click Unsubscribe

- **Database Model**: `NotificationPreference` stores user choices (master email toggle, category toggles for tasks, mentions, comments, goals, billing, and system notices, as well as a unique `unsubscribeToken`).
- **Account Settings**: Users can customize their preferences at `/account` under the **Email Notifications** section.
- **Unsubscribe URL**:
  - `GET /api/notifications/unsubscribe?token={token}`: Displays a friendly web confirmation page.
  - `POST /api/notifications/unsubscribe`: Handles machine-readable RFC 8058 unsubscribe webhooks.

---

## 6. Resilience & Error Handling

- **Transient Error Classification**: Automatically detects rate limits (HTTP 429), server errors (500, 502, 503, 504), and socket timeouts (`ECONNRESET`, `ETIMEDOUT`).
- **Exponential Backoff**: Retries transient failures up to 3 times with exponential backoff and randomized jitter (`delay = 400ms * 2^(attempt-1) + jitter`).
- **Permanent Errors**: Client errors (HTTP 400, 401, 403, 422) stop immediately to avoid wasting API quota.
- **Privacy Masking**: All failure logs automatically mask recipient email addresses (`jo***@example.com`) to prevent leaking PII in server log aggregation services.

---

## 7. Running Tests

Run the test suite to verify email service logic, template rendering, and preference evaluation:

```bash
npm test
```
