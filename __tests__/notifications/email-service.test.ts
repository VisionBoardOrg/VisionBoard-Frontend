import { describe, it, expect, vi } from "vitest";
import {
  maskEmail,
  isTransientError,
  sendEmailWithRetry,
} from "@/lib/email/email-service";

describe("email-service utilities", () => {
  describe("maskEmail", () => {
    it("correctly masks email usernames for privacy", () => {
      expect(maskEmail("alex@example.com")).toBe("al***@example.com");
      expect(maskEmail("jo@company.org")).toBe("j***@company.org");
      expect(maskEmail("a@b.com")).toBe("a***@b.com");
      expect(maskEmail("invalid-email")).toBe("***@***");
    });
  });

  describe("isTransientError", () => {
    it("identifies HTTP 429 and 5xx as transient", () => {
      expect(isTransientError({ statusCode: 429 })).toBe(true);
      expect(isTransientError({ status: 500 })).toBe(true);
      expect(isTransientError({ statusCode: 502 })).toBe(true);
      expect(isTransientError({ responseCode: 503 })).toBe(true);
      expect(isTransientError({ status: 504 })).toBe(true);
    });

    it("identifies network socket and timeout errors as transient", () => {
      expect(isTransientError({ code: "ECONNRESET" })).toBe(true);
      expect(isTransientError({ code: "ETIMEDOUT" })).toBe(true);
      expect(isTransientError({ message: "Request timed out after 5000ms" })).toBe(true);
      expect(isTransientError({ message: "Rate limit exceeded" })).toBe(true);
    });

    it("identifies 4xx client errors as permanent non-retryable", () => {
      expect(isTransientError({ statusCode: 400 })).toBe(false);
      expect(isTransientError({ status: 401 })).toBe(false);
      expect(isTransientError({ statusCode: 403 })).toBe(false);
      expect(isTransientError({ statusCode: 404 })).toBe(false);
      expect(isTransientError({ statusCode: 422 })).toBe(false);
    });
  });

  describe("sendEmailWithRetry", () => {
    it("dispatches using console provider in development/test without API keys", async () => {
      const result = await sendEmailWithRetry({
        to: "recipient@example.com",
        subject: "Test Subject",
        html: "<p>Hello</p>",
        text: "Hello",
        unsubscribeUrl: "https://vision-board.tech/api/notifications/unsubscribe?token=123",
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe("console");
      expect(result.attempts).toBe(1);
      expect(result.messageId).toBeDefined();
    });
  });
});
