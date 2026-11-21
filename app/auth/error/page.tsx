"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Loader2 } from "lucide-react";

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const getErrorGuidance = (errorCode: string | null) => {
    switch (errorCode) {
      case "Configuration":
        return {
          title: "Sign-in Temporarily Unavailable",
          message:
            "We ran into a temporary issue on our end while signing you in. Please try again in a few moments, or contact support if the problem persists.",
        };
      case "AccessDenied":
        return {
          title: "Access Denied",
          message:
            "You do not have permission to sign in with this account. Try signing in with a different email address or contact your workspace admin.",
        };
      case "Verification":
        return {
          title: "Link Expired",
          message:
            "This sign-in or verification link has expired or has already been used. Please request a fresh link and try again.",
        };
      case "OAuthAccountNotLinked":
        return {
          title: "Account Already Exists",
          message:
            "An account with that email address already exists using a different sign-in method. Sign in with your email and password instead.",
        };
      case "OAuthSignin":
      case "OAuthCallback":
      case "OAuthCreateAccount":
      case "EmailCreateAccount":
      case "Callback":
        return {
          title: "Could Not Complete Sign-in",
          message:
            "We couldn't finish signing you in with your authentication provider. Please try again or use your email and password.",
        };
      default:
        return {
          title: "Authentication Error",
          message:
            "Something went wrong while signing you in. Please try again, or reset your password if you're having trouble accessing your account.",
        };
    }
  };

  const { title, message } = getErrorGuidance(error);

  return (
    <div className="min-h-screen bg-offwhite flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-border p-8 shadow-sm text-center">
        <div className="w-12 h-12 rounded-full bg-red-100 text-danger flex items-center justify-center mx-auto mb-4">
          <AlertCircle size={24} aria-hidden="true" />
        </div>
        <h1 className="text-xl font-bold text-ink mb-2">{title}</h1>
        <p className="text-slate text-sm mb-6 leading-relaxed">{message}</p>

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
    <Suspense
      fallback={
        <div className="min-h-screen bg-offwhite flex items-center justify-center gap-2 text-sm text-slate">
          <Loader2 size={16} className="animate-spin text-blue" aria-hidden="true" />
          <span>Loading…</span>
        </div>
      }
    >
      <AuthErrorContent />
    </Suspense>
  );
}
