/**
 * lib/email/email-service.ts
 *
 * Enterprise-grade email transmission service with:
 *   - Primary provider: Resend API
 *   - Fallback provider: Nodemailer SMTP
 *   - Dev/test fallback: Mock console logger
 *   - Exponential backoff retry logic for transient errors (429, 5xx, timeouts)
 *   - Immediate short-circuit and structured logging for permanent errors (4xx)
 *   - Privacy-safe recipient masking in failure logs
 *   - RFC 8058 compliant unsubscribe headers
 */

import { Resend } from "resend";
import nodemailer from "nodemailer";

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
  from?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  unsubscribeUrl?: string;
  maxRetries?: number;
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  provider: "resend" | "smtp" | "console";
  attempts: number;
  error?: string;
  isTransient?: boolean;
}

/**
 * Mask email address for privacy-safe logging (e.g., "jo***@example.com").
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes("@")) return "***@***";
  const [local, domain] = email.split("@");
  if (local.length <= 2) {
    return `${local.charAt(0)}***@${domain}`;
  }
  return `${local.slice(0, 2)}***@${domain}`;
}

/**
 * Determine if an error is transient (safe to retry) or permanent (terminal).
 */
export function isTransientError(err: unknown): boolean {
  if (!err) return false;

  const error = err as Record<string, unknown>;
  const status = Number(error?.statusCode || error?.status || error?.responseCode || 0);
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();

  // Known transient HTTP status codes
  if (status === 429 || (status >= 500 && status <= 599)) {
    return true;
  }

  // Known transient network error codes
  const transientCodes = [
    "ECONNRESET",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "EAI_AGAIN",
    "ENOTFOUND",
    "ESOCKETTIMEDOUT",
    "EPIPE",
  ];
  if (transientCodes.includes(code)) {
    return true;
  }

  // Timeout and transient network strings
  if (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("socket hang up") ||
    message.includes("network error") ||
    message.includes("connection reset")
  ) {
    return true;
  }

  // Explicit permanent HTTP codes
  if (status >= 400 && status < 500) {
    return false;
  }

  return false;
}

/**
 * Delay execution for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Low-level single dispatch attempt using the best configured provider.
 */
async function dispatchSingle(options: SendEmailOptions): Promise<{
  success: boolean;
  messageId?: string;
  provider: "resend" | "smtp" | "console";
  error?: unknown;
}> {
  const defaultFrom = process.env.EMAIL_FROM || "VisionBoard <notifications@resend.dev>";
  const from = options.from || defaultFrom;
  const to = options.to;
  const subject = options.subject;
  const html = options.html;
  const text = options.text;

  // Build compliance headers (RFC 8058 One-Click Unsubscribe)
  const headers: Record<string, string> = { ...options.headers };
  if (options.unsubscribeUrl) {
    headers["List-Unsubscribe"] = `<${options.unsubscribeUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  // 1. Resend API (Primary)
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (resendApiKey) {
    const resend = new Resend(resendApiKey);
    const response = await resend.emails.send({
      from,
      to,
      subject,
      html,
      text,
      replyTo: options.replyTo,
      headers,
    });

    if (response.error) {
      return {
        success: false,
        provider: "resend",
        error: response.error,
      };
    }

    return {
      success: true,
      provider: "resend",
      messageId: response.data?.id,
    };
  }

  // 2. Nodemailer SMTP (Fallback)
  const smtpHost = process.env.SMTP_HOST;
  if (smtpHost) {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER || "",
        pass: process.env.SMTP_PASS || "",
      },
    });

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      html,
      text,
      replyTo: options.replyTo,
      headers,
    });

    return {
      success: true,
      provider: "smtp",
      messageId: info.messageId,
    };
  }

  // 3. Local Development / Test Console Fallback
  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[email-service][DEV] Delivered to ${maskEmail(to)} | Subject: "${subject}" | Provider: console`
    );
  }

  return {
    success: true,
    provider: "console",
    messageId: `dev-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
  };
}

/**
 * Transmit email with automated retries for transient errors.
 */
export async function sendEmailWithRetry(
  options: SendEmailOptions
): Promise<EmailSendResult> {
  const maxRetries = options.maxRetries ?? 3;
  let attempt = 0;
  let lastError: unknown = null;

  while (attempt < maxRetries) {
    attempt++;

    try {
      const result = await dispatchSingle(options);

      if (result.success) {
        if (attempt > 1) {
          console.log(
            `[email-service] Successfully dispatched email to ${maskEmail(options.to)} on retry attempt ${attempt}.`
          );
        }
        return {
          success: true,
          messageId: result.messageId,
          provider: result.provider,
          attempts: attempt,
        };
      }

      // Single dispatch returned an error object
      lastError = result.error;
    } catch (err) {
      lastError = err;
    }

    const transient = isTransientError(lastError);

    // If error is permanent (e.g. invalid recipient, 401 unauthorized), do not retry
    if (!transient) {
      const errorMessage =
        lastError instanceof Error
          ? lastError.message
          : JSON.stringify(lastError);

      console.error(
        `[email-service] PERMANENT FAILURE: Unable to deliver email to ${maskEmail(
          options.to
        )} (Attempt ${attempt}/${maxRetries}): ${errorMessage}`
      );

      return {
        success: false,
        provider: "resend",
        attempts: attempt,
        error: errorMessage,
        isTransient: false,
      };
    }

    // If error is transient and we have remaining attempts, back off exponentially with jitter
    if (attempt < maxRetries) {
      const baseDelay = 400; // ms
      const jitter = Math.floor(Math.random() * 200);
      const backoffMs = baseDelay * Math.pow(2, attempt - 1) + jitter;

      console.warn(
        `[email-service] TRANSIENT FAILURE: Retrying email to ${maskEmail(
          options.to
        )} in ${backoffMs}ms (Attempt ${attempt}/${maxRetries}). Error:`,
        lastError instanceof Error ? lastError.message : lastError
      );

      await sleep(backoffMs);
    }
  }

  // Retries exhausted
  const finalMessage =
    lastError instanceof Error ? lastError.message : JSON.stringify(lastError);

  console.error(
    `[email-service] EXHAUSTED RETRIES: Email delivery to ${maskEmail(
      options.to
    )} failed permanently after ${maxRetries} attempts. Error: ${finalMessage}`
  );

  return {
    success: false,
    provider: "resend",
    attempts: attempt,
    error: finalMessage,
    isTransient: true,
  };
}
