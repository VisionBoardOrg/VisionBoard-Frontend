"use client";

import React, { useState, useEffect, useCallback } from "react";
import { X, Sparkles, Mail, User, Building, Users, AlertCircle, ArrowRight, KeyRound, Gift } from "lucide-react";
import PrimaryButton from "../reusables/primaryButton";
import WaitlistStatusCard from "./WaitlistStatusCard";

interface WaitlistStatusData {
  email: string;
  fullName: string;
  position: number;
  totalWaitlist: number;
  referralCode: string;
  referralLink: string;
  referralCount: number;
  status: "PENDING" | "INVITED" | "REGISTERED" | "EXPIRED";
  inviteToken?: string;
}

interface WaitlistModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultReferredBy?: string;
}

export default function WaitlistModal({ isOpen, onClose, defaultReferredBy }: WaitlistModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [teamSize, setTeamSize] = useState<"1-10" | "10-50" | "50-200" | "200+">("10-50");
  const [role, setRole] = useState<"product_manager" | "engineering_lead" | "executive" | "designer" | "other">("product_manager");
  const [painPoint, setPainPoint] = useState<"ai_roadmaps" | "visual_canvas" | "github_jira_sync" | "okr_deconstruction" | "other">("ai_roadmaps");
  const [vipCode, setVipCode] = useState("");
  const [referredByCode, setReferredByCode] = useState<string>(defaultReferredBy || "");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusResult, setStatusResult] = useState<WaitlistStatusData | null>(null);

  const fetchStatus = useCallback(async (userEmail: string) => {
    try {
      const res = await fetch(`/api/waitlist/status?email=${encodeURIComponent(userEmail)}`);
      const json = await res.json();
      if (json.success && json.data) {
        setStatusResult(json.data as WaitlistStatusData);
      }
    } catch {}
  }, []);

  // Sync defaultReferredBy prop
  useEffect(() => {
    if (defaultReferredBy) {
      const ref = defaultReferredBy.toUpperCase();
      queueMicrotask(() => setReferredByCode(ref));
    }
  }, [defaultReferredBy]);

  // Capture referral code from URL search param (?ref=...) or localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const refParam = urlParams.get("ref");
      if (refParam) {
        const ref = refParam.toUpperCase();
        queueMicrotask(() => setReferredByCode(ref));
        sessionStorage.setItem("vb_referred_by", ref);
      } else {
        const storedRef = sessionStorage.getItem("vb_referred_by");
        if (storedRef) {
          const ref = storedRef.toUpperCase();
          queueMicrotask(() => setReferredByCode(ref));
        }
      }
    }
  }, []);

  // Check if user already joined waitlist (only if NOT accessing via a referral link)
  useEffect(() => {
    if (isOpen) {
      const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      const refParam = urlParams?.get("ref");
      
      if (refParam || defaultReferredBy) {
        // Referral link passed: show join form for the new user
        queueMicrotask(() => setStatusResult(null));
      } else {
        const savedEmail = localStorage.getItem("vb_waitlist_email");
        if (savedEmail) {
          queueMicrotask(() => {
            void fetchStatus(savedEmail);
          });
        } else {
          queueMicrotask(() => setStatusResult(null));
        }
      }
    }
  }, [isOpen, defaultReferredBy, fetchStatus]);

  // Handle ESC key press to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleStep1Submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!email.includes("@")) {
      setErrorMessage("Please enter a valid work email address");
      return;
    }
    if (!fullName.trim()) {
      setErrorMessage("Please enter your full name");
      return;
    }

    setStep(2);
  };

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/waitlist/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          fullName,
          company,
          teamSize,
          role,
          painPoint,
          referredBy: referredByCode,
          vipCode,
        }),
      });

      const json = await res.json();

      if (json.success && json.data) {
        localStorage.setItem("vb_waitlist_email", email);
        setStatusResult(json.data as WaitlistStatusData);
      } else {
        setErrorMessage(json.message || "Failed to join waitlist. Please try again.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error. Please try again.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-xl my-auto cursor-default"
      >
        {/* Modal Close Button */}
        <button
          onClick={onClose}
          type="button"
          aria-label="Close modal"
          className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate hover:text-ink flex items-center justify-center transition-colors shadow-xs"
        >
          <X className="w-4 h-4" />
        </button>

        {statusResult ? (
          <WaitlistStatusCard
            data={statusResult}
            onReset={() => {
              localStorage.removeItem("vb_waitlist_email");
              setStatusResult(null);
              setStep(1);
            }}
          />
        ) : (
          <div className="w-full bg-white rounded-3xl border border-border shadow-2xl p-8 space-y-6">
            {/* Header */}
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-blue-faint border border-blue-light flex items-center justify-center mx-auto text-blue mb-3">
                <Sparkles className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-bold text-ink tracking-tight">Join Exclusive Early Access</h2>
              <p className="text-sm text-slate">
                Get early access to VisionBoard before public launch.
              </p>
            </div>

            {/* Step Indicators */}
            <div className="flex items-center justify-center gap-2">
              <div className={`h-1.5 rounded-full transition-all duration-300 ${step === 1 ? "w-12 bg-blue" : "w-4 bg-slate-200"}`} />
              <div className={`h-1.5 rounded-full transition-all duration-300 ${step === 2 ? "w-12 bg-blue" : "w-4 bg-slate-200"}`} />
            </div>

            {errorMessage && (
              <div className="bg-danger/10 border border-danger/30 rounded-xl p-3 flex items-start gap-2 text-xs text-danger font-medium">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {step === 1 ? (
              <form onSubmit={handleStep1Submit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-ink mb-1">Work Email Address</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate absolute left-3.5 top-3" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="alex@company.com"
                      className="w-full pl-10 pr-4 py-2.5 bg-offwhite/50 border border-border rounded-xl text-sm font-medium text-ink placeholder:text-slate/60 focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink mb-1">Full Name</label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate absolute left-3.5 top-3" />
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Alex Vance"
                      className="w-full pl-10 pr-4 py-2.5 bg-offwhite/50 border border-border rounded-xl text-sm font-medium text-ink placeholder:text-slate/60 focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-ink mb-1">Company / Team</label>
                    <div className="relative">
                      <Building className="w-4 h-4 text-slate absolute left-3 top-3" />
                      <input
                        type="text"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        placeholder="Acme Corp"
                        className="w-full pl-9 pr-3 py-2 bg-offwhite/50 border border-border rounded-xl text-xs font-medium text-ink placeholder:text-slate/60 focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-ink mb-1">Team Size</label>
                    <div className="relative">
                      <Users className="w-4 h-4 text-slate absolute left-3 top-3" />
                      <select
                        value={teamSize}
                        onChange={(e) => setTeamSize(e.target.value as "1-10" | "10-50" | "50-200" | "200+")}
                        className="w-full pl-9 pr-3 py-2 bg-white border border-border rounded-xl text-xs font-medium text-ink focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-all"
                      >
                        <option value="1-10" className="text-ink bg-white">1-10 people</option>
                        <option value="10-50" className="text-ink bg-white">10-50 people</option>
                        <option value="50-200" className="text-ink bg-white">50-200 people</option>
                        <option value="200+" className="text-ink bg-white">200+ people</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink mb-1">Your Primary Role</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "product_manager", label: "Product PM" },
                      { id: "engineering_lead", label: "Eng Lead" },
                      { id: "executive", label: "Founder / VP" },
                      { id: "designer", label: "Designer" },
                      { id: "other", label: "Ops & Other" },
                    ].map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setRole(r.id as "product_manager" | "engineering_lead" | "executive" | "designer" | "other")}
                        className={`py-2 px-2 rounded-xl border text-xs font-semibold transition-all ${
                          role === r.id
                            ? "bg-blue-faint border-blue text-blue shadow-sm font-bold"
                            : "bg-white border-border text-slate hover:text-ink hover:bg-slate-50"
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                <PrimaryButton type="submit" className="w-full justify-center py-2.5 font-semibold text-white">
                  Continue <ArrowRight className="w-4 h-4 ml-1" />
                </PrimaryButton>
              </form>
            ) : (
              <form onSubmit={handleFinalSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-ink mb-1">
                    What feature are you most excited to try?
                  </label>
                  <div className="space-y-2">
                    {[
                      { id: "ai_roadmaps", label: "AI Roadmap Generator & OKR Deconstruction" },
                      { id: "visual_canvas", label: "2D Interactive Canvas Board (React Flow)" },
                      { id: "github_jira_sync", label: "GitHub & Jira Webhook Synchronization" },
                      { id: "other", label: "Connected PRD Documentation & Multi-Tenancy" },
                    ].map((p) => (
                      <label
                        key={p.id}
                        className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                          painPoint === p.id
                            ? "bg-blue-faint border-blue text-blue font-bold"
                            : "bg-white border-border text-ink hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="painPoint"
                          checked={painPoint === p.id}
                          onChange={() => setPainPoint(p.id as "ai_roadmaps" | "visual_canvas" | "github_jira_sync" | "okr_deconstruction" | "other")}
                          className="w-4 h-4 text-blue"
                        />
                        <span className="text-xs font-medium text-ink">{p.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-ink mb-1">
                      Referral Code (Optional)
                    </label>
                    <div className="relative">
                      <Gift className="w-4 h-4 text-slate absolute left-3.5 top-3" />
                      <input
                        type="text"
                        value={referredByCode}
                        onChange={(e) => setReferredByCode(e.target.value.toUpperCase())}
                        placeholder="e.g. ARIY925"
                        className="w-full pl-10 pr-4 py-2.5 bg-offwhite/50 border border-border rounded-xl text-xs font-mono uppercase font-bold text-ink placeholder:text-slate/60 focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-ink mb-1">
                      VIP Access Code (Optional)
                    </label>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-slate absolute left-3.5 top-3" />
                      <input
                        type="text"
                        value={vipCode}
                        onChange={(e) => setVipCode(e.target.value)}
                        placeholder="e.g. VISIONBOARD2026VIP"
                        className="w-full pl-10 pr-4 py-2.5 bg-offwhite/50 border border-border rounded-xl text-xs font-mono uppercase font-bold text-ink placeholder:text-slate/60 focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-all"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="w-1/3 py-2.5 border border-border rounded-xl text-xs font-bold text-slate hover:text-ink hover:bg-slate-50 transition-colors"
                  >
                    Back
                  </button>
                  <PrimaryButton
                    type="submit"
                    disabled={isSubmitting}
                    className="w-2/3 justify-center py-2.5 font-semibold text-white"
                  >
                    {isSubmitting ? "Securing position..." : "Join Waitlist"}
                  </PrimaryButton>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
