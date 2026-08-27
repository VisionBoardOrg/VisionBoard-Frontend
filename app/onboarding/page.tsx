"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MemberRole } from "@prisma/client";
import { TemplateName } from "@/lib/templates";
import Logo from "@/components/reusables/Logo";
import { Target, Building2, Settings, TrendingUp, Map, ClipboardList, Zap, ArrowRight, LayoutTemplate } from "lucide-react";

type Step = 1 | 2 | 3;

const ROLES: { value: MemberRole; label: string; icon: React.ElementType; description: string }[] = [
  { value: "pm", label: "Product Manager", icon: Target, description: "Roadmaps, OKRs, feature prioritization" },
  { value: "exec", label: "Executive / Strategy", icon: Building2, description: "Company-wide rollup, team alignment" },
  { value: "eng", label: "Engineering / Ops", icon: Settings, description: "Sprint boards, blockers, velocity" },
  { value: "marketing", label: "Marketing / Growth", icon: TrendingUp, description: "Campaign milestones, launch timelines" },
];

const TEMPLATES: { value: TemplateName; label: string; icon: React.ElementType; description: string; tags: string[] }[] = [
  { value: "blank", label: "Blank", icon: LayoutTemplate, description: "Start with a completely empty workspace — build your own structure from scratch.", tags: ["Empty", "Custom"] },
  { value: "okr_board", label: "OKR Board", icon: Target, description: "Objectives & key results with quarterly tracking and progress rings.", tags: ["Q3", "Goals", "KRs"] },
  { value: "product_roadmap", label: "Product Roadmap", icon: Map, description: "Connect feedback → features → releases on a visual timeline.", tags: ["Milestones", "Releases", "Features"] },
  { value: "quarterly_plan", label: "Quarterly Plan", icon: ClipboardList, description: "Multi-team goals mapped to resource allocation and bandwidth.", tags: ["Teams", "Resources", "Q-plan"] },
  { value: "sprint_board", label: "Sprint Board", icon: Zap, description: "Agile board with velocity forecasting and standup summaries.", tags: ["Agile", "Velocity", "Standups"] },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [selectedRole, setSelectedRole] = useState<MemberRole | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateName | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleComplete() {
    if (!selectedRole || !selectedTemplate || !workspaceName.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: workspaceName.trim(),
          role: selectedRole,
          template: selectedTemplate,
        }),
      });

      let data: { error?: string; workspace?: { id: string } } | null = null;
      try {
        data = await res.json();
      } catch {
        // Non-JSON response
      }

      if (!res.ok) {
        setError(data?.error || `Failed to create workspace (${res.status}). Please try again.`);
        return;
      }

      if (data?.workspace?.id) {
        router.push(`/workspace/${data.workspace.id}/board`);
      }
    } catch (err: unknown) {
      console.error("[handleComplete]", err);
      setError("An unexpected network error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const progress = ((step - 1) / 2) * 100;

  return (
    <div className="min-h-screen bg-offwhite flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-white">
        <Logo markSize={32} textSize={18} />
        <span className="text-sm text-muted">Step {step} of 3</span>
      </header>

      {/* Progress bar */}
      <div className="h-1 bg-border">
        <div
          className="h-full bg-blue transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex-1 flex items-start justify-center pt-12 pb-24 px-4">
        <div className="w-full max-w-2xl">

          {/* STEP 1 — Role */}
          {step === 1 && (
            <div>
              <h1 className="text-2xl font-bold text-ink mb-2">What&apos;s your primary role?</h1>
              <p className="text-slate mb-1">We&apos;ll set your default dashboard view to match. You&apos;ll be the workspace <strong>admin</strong> so you can invite your team.</p>
              <p className="text-xs text-muted mb-8">You can change your view role at any time from workspace settings.</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ROLES.map((role) => {
                  const Icon = role.icon;
                  const isSelected = selectedRole === role.value;
                  return (
                    <button
                      key={role.value}
                      onClick={() => setSelectedRole(role.value)}
                      aria-pressed={isSelected}
                      className={`text-left p-5 rounded-2xl border-2 transition-all cursor-pointer ${
                        isSelected
                          ? "border-blue bg-blue-faint shadow-primary"
                          : "border-border bg-white hover:border-blue/40"
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition-colors ${
                        isSelected ? "bg-blue text-white" : "bg-blue/10 text-blue"
                      }`}>
                        <Icon size={20} aria-hidden="true" />
                      </div>
                      <div className="font-semibold text-ink text-sm">{role.label}</div>
                      <div className="text-xs text-slate mt-1">{role.description}</div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-8 flex justify-end">
                <button
                  onClick={() => setStep(2)}
                  disabled={!selectedRole}
                  className="bg-blue text-white rounded-xl px-6 py-3 text-sm font-semibold hover:bg-blue-mid transition-colors disabled:opacity-50 inline-flex items-center gap-2"
                >
                  <span>Continue</span>
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2 — Template */}
          {step === 2 && (
            <div>
              <h1 className="text-2xl font-bold text-ink mb-2">Pick a starting template</h1>
              <p className="text-slate mb-8">Your workspace will be pre-populated with realistic sample data — edit it freely.</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {TEMPLATES.map((t) => {
                  const Icon = t.icon;
                  const isSelected = selectedTemplate === t.value;
                  return (
                    <button
                      key={t.value}
                      onClick={() => setSelectedTemplate(t.value)}
                      aria-pressed={isSelected}
                      className={`text-left p-5 rounded-2xl border-2 transition-all cursor-pointer ${
                        isSelected
                          ? "border-blue bg-blue-faint shadow-primary"
                          : "border-border bg-white hover:border-blue/40"
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition-colors ${
                        isSelected ? "bg-blue text-white" : "bg-blue/10 text-blue"
                      }`}>
                        <Icon size={20} aria-hidden="true" />
                      </div>
                      <div className="font-semibold text-ink text-sm">{t.label}</div>
                      <div className="text-xs text-slate mt-1 mb-3">{t.description}</div>
                      <div className="flex flex-wrap gap-1">
                        {t.tags.map((tag) => (
                          <span key={tag} className="bg-blue-light text-blue-deep text-[10px] font-medium px-2 py-0.5 rounded-full">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-8 flex justify-between">
                <button
                  onClick={() => setStep(1)}
                  className="text-sm text-slate hover:text-ink transition-colors"
                >
                  ← Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!selectedTemplate}
                  className="bg-blue text-white rounded-xl px-6 py-3 text-sm font-semibold hover:bg-blue-mid transition-colors disabled:opacity-50 inline-flex items-center gap-2"
                >
                  <span>Continue</span>
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 — Workspace name */}
          {step === 3 && (
            <div>
              <h1 className="text-2xl font-bold text-ink mb-2">Name your workspace</h1>
              <p className="text-slate mb-8">This is usually your company or team name. You can change it any time.</p>

              <div className="bg-white rounded-2xl border border-border p-8">
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-danger mb-4">
                    {error}
                  </div>
                )}

                <label className="block text-sm font-medium text-ink mb-1.5" htmlFor="workspace-name">
                  Workspace name
                </label>
                <input
                  id="workspace-name"
                  type="text"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder="Acme Corp"
                  maxLength={80}
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-colors"
                />

                {/* Summary */}
                <div className="mt-6 bg-offwhite rounded-xl p-4 space-y-2">
                  <h3 className="text-xs font-semibold text-ink uppercase tracking-wide">Your workspace</h3>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-muted w-32">Dashboard view</span>
                    <span className="font-medium text-ink capitalize">{selectedRole?.replace("_", " ")}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-muted w-32">Workspace role</span>
                    <span className="font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full text-xs">Admin</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-muted w-32">Template</span>
                    <span className="font-medium text-ink">{TEMPLATES.find(t => t.value === selectedTemplate)?.label}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-muted w-32">Plan</span>
                    <span className="font-medium text-ink">Free (10 AI credits/month)</span>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-between">
                <button
                  onClick={() => setStep(2)}
                  className="text-sm text-slate hover:text-ink transition-colors"
                >
                  ← Back
                </button>
                <button
                  onClick={handleComplete}
                  disabled={!workspaceName.trim() || loading}
                  className="bg-blue text-white rounded-xl px-8 py-3 text-sm font-semibold hover:bg-blue-mid transition-colors disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {loading ? "Setting up your workspace…" : (
                    <>
                      <span>Launch workspace</span>
                      <ArrowRight size={16} aria-hidden="true" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

