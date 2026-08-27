"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const getErrorMessage = (errorCode: string | null) => {
    switch (errorCode) {
      case "Configuration":
        return "There is a problem with the server authentication configuration. Please check your environment variables (e.g. GOOGLE_CLIENT_ID or AUTH_SECRET).";
      case "AccessDenied":
        return "Access denied. You do not have permission to sign in.";
      case "Verification":
        return "The verification token has expired or has already been used.";
      case "OAuthAccountNotLinked":
        return "Another account already exists with the same email address. Try signing in with your email and password instead, or link your Google account.";
      case "OAuthSignin":
      case "OAuthCallback":
      case "OAuthCreateAccount":
      case "EmailCreateAccount":
      case "Callback":
        return "Could not complete sign-in with the authentication provider. Please verify your Google OAuth configuration.";
      default:
        return "An unexpected authentication error occurred. Please try again.";
    }
  };

  return (
    <div className="min-h-screen bg-offwhite flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-border p-8 shadow-sm text-center">
        <div className="w-12 h-12 rounded-full bg-red-100 text-danger flex items-center justify-center mx-auto mb-4">
          <AlertCircle size={24} />
        </div>
        <h1 className="text-xl font-bold text-ink mb-2">Authentication Error</h1>
        <p className="text-slate text-sm mb-6">{getErrorMessage(error)}</p>

        {error && (
          <div className="bg-slate/5 rounded-lg p-3 text-xs font-mono text-slate mb-6">
            Error code: {error}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <Link
            href="/auth/login"
            className="w-full bg-blue text-white rounded-xl px-4 py-3 text-sm font-semibold hover:bg-blue-mid transition-colors"
          >
            Back to Sign In
          </Link>
          <Link
            href="/"
            className="w-full text-slate hover:text-ink text-sm py-2 transition-colors"
          >
            Go to Home
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense>
      <AuthErrorContent />
    </Suspense>
  );
}
