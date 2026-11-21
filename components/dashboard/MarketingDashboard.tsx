"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { DashboardWorkspace } from "@/types/dashboard";

interface MarketingDashboardProps { workspace: DashboardWorkspace; userId: string; userName: string }

export function MarketingDashboard({ workspace }: MarketingDashboardProps) {
  // Find milestones with upcoming target dates (treat as launch milestones)
  const allMilestones = workspace.goals.flatMap((g) => g.milestones);
  const now = new Date();
  const allUpcoming = allMilestones
    .filter((m) => m.targetDate && new Date(m.targetDate) > now)
    .sort((a, b) => new Date(a.targetDate!).getTime() - new Date(b.targetDate!).getTime());
  const upcoming = allUpcoming.slice(0, 6);

  function daysUntil(date: Date | string | null) {
    if (!date) return null;
    const d = Math.ceil((new Date(date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return d;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-ink">Marketing / Growth</h2>
        <p className="text-slate text-sm mt-1">Campaign milestones and launch timelines</p>
      </div>

      {/* Launch timeline */}
      <div className="bg-white rounded-2xl border border-border p-6">
        <h3 className="font-semibold text-ink mb-5">Upcoming Launches</h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted">
            No upcoming milestones.{" "}
            <Link
              href={`/workspace/${workspace.id}/roadmap`}
              className="text-blue font-medium hover:underline"
            >
              Add milestones on the Roadmap
            </Link>
            .
          </p>
        ) : (
          <>
            <div className="space-y-3">
              {upcoming.map((m) => {
                const days = daysUntil(m.targetDate);
                const isUrgent = days !== null && days <= 7;
                return (
                  <div key={m.id} className="flex items-center gap-4 p-4 rounded-xl bg-offwhite border border-border">
                    <div className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center text-white text-xs font-bold shrink-0 ${
                      isUrgent ? "bg-danger" : "bg-blue"
                    }`}>
                      <span>{days}</span>
                      <span className="text-[8px] font-normal">{days === 1 ? "day" : "days"}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-ink text-sm truncate">{m.title}</div>
                      <div className="text-xs text-muted mt-0.5">
                        {m.targetDate ? new Date(m.targetDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "No date"}
                      </div>
                    </div>
                    <StatusChip status={m.status} />
                  </div>
                );
              })}
            </div>
            {allUpcoming.length > 6 && (
              <Link
                href={`/workspace/${workspace.id}/roadmap`}
                className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-blue hover:underline"
              >
                View all {allUpcoming.length} upcoming launches on the Roadmap <ArrowRight size={12} aria-hidden="true" />
              </Link>
            )}
          </>
        )}
      </div>

      {/* Goal summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-border p-5 text-center">
          <div className="text-3xl font-bold text-ink">{workspace._count.goals}</div>
          <div className="text-sm text-muted mt-1">Active goals</div>
        </div>
        <div className="bg-white rounded-2xl border border-border p-5 text-center">
          <div className="text-3xl font-bold text-blue">{allUpcoming.length}</div>
          <div className="text-sm text-muted mt-1">Upcoming launches</div>
        </div>
        <div className="bg-white rounded-2xl border border-border p-5 text-center">
          <div className="text-3xl font-bold text-success">
            {allMilestones.filter((m) => m.status === "completed").length}
          </div>
          <div className="text-sm text-muted mt-1">Milestones shipped</div>
        </div>
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const styles: Record<string, string> = {
    planned: "bg-border text-slate",
    in_progress: "bg-blue-light text-blue-deep",
    completed: "bg-green-100 text-success",
    delayed: "bg-red-100 text-danger",
  };
  return (
    <span className={`text-[10px] font-medium px-2.5 py-1 rounded-full capitalize shrink-0 ${styles[status] ?? "bg-border text-muted"}`}>
      {status.replace("_", " ")}
    </span>
  );
}
