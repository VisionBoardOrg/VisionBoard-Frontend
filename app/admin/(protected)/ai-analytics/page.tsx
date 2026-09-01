import { Metadata } from "next";
import { cookies } from "next/headers";
import { Sparkles, CheckCircle2, XCircle, TrendingUp } from "lucide-react";
import MetricCard from "@/components/admin/MetricCard";

export const metadata: Metadata = { title: "AI Analytics" };

interface AiMetricsData {
  period: { days: number; since: string };
  summary: {
    totalCalls: number;
    totalTokens: number;
    acceptanceRate: number | null;
    acceptedCount: number;
    rejectedCount: number;
  };
  byFeature: Array<{ feature: string; calls: number; tokens: number }>;
  daily: Array<{ day: string; calls: number; tokens: number }>;
}

async function getAiMetrics(days = 30): Promise<AiMetricsData | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("admin_session")?.value;
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  try {
    const res = await fetch(`${baseUrl}/api/admin/ai-metrics?days=${days}`, {
      headers: { Cookie: `admin_session=${sessionCookie}` },
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

const FEATURE_LABELS: Record<string, string> = {
  roadmap_generator: "Roadmap Generator",
  goal_deconstructor: "Goal Deconstructor",
  progress_insights: "Progress Insights",
  nl_board_edit: "NL Board Edit",
  workspace_copilot: "Workspace Copilot",
  executive_summary: "Executive Summary",
};

const FEATURE_COLORS = [
  "bg-blue",
  "bg-cyan",
  "bg-success",
  "bg-warning",
  "bg-blue-mid",
  "bg-blue-deep",
];

export default async function AiAnalyticsPage() {
  const data = await getAiMetrics(30);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-slate text-sm font-medium">Failed to load AI metrics.</p>
      </div>
    );
  }

  const { summary, byFeature, period } = data;
  const maxCalls = Math.max(1, ...byFeature.map((f) => f.calls));

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-ink tracking-tight">AI Analytics</h1>
        <p className="text-sm text-slate font-medium mt-1">
          Token usage and model interactions over the last {period.days} days.
        </p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard
          title="Total AI Calls"
          value={summary.totalCalls.toLocaleString()}
          icon={Sparkles}
        />
        <MetricCard
          title="Total Tokens"
          value={`${(summary.totalTokens / 1000).toFixed(1)}k`}
          subtitle="Input + output"
          icon={TrendingUp}
          iconColor="text-success"
        />
        <MetricCard
          title="Accepted"
          value={summary.acceptedCount.toLocaleString()}
          icon={CheckCircle2}
          iconColor="text-success"
        />
        <MetricCard
          title="Acceptance Rate"
          value={summary.acceptanceRate !== null ? `${summary.acceptanceRate}%` : "—"}
          trend={
            summary.acceptanceRate !== null
              ? {
                  direction: summary.acceptanceRate >= 60 ? "up" : "down",
                  label: `${summary.rejectedCount} rejected`,
                  positive: true,
                }
              : undefined
          }
          icon={XCircle}
          iconColor={
            summary.acceptanceRate !== null && summary.acceptanceRate >= 60
              ? "text-success"
              : "text-warning"
          }
        />
      </div>

      {/* Feature breakdown */}
      <div className="bg-white border border-border rounded-2xl p-5 shadow-sm">
        <h2 className="text-sm font-bold text-ink mb-5">Usage by Feature</h2>
        {byFeature.length === 0 ? (
          <p className="text-sm text-muted font-medium text-center py-8">
            No AI usage recorded in this period.
          </p>
        ) : (
          <div className="space-y-4">
            {byFeature
              .sort((a, b) => b.calls - a.calls)
              .map((f, idx) => (
                <div key={f.feature}>
                  <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                    <span className="text-ink">
                      {FEATURE_LABELS[f.feature] ?? f.feature}
                    </span>
                    <span className="text-muted">
                      {f.calls.toLocaleString()} calls ·{" "}
                      {(f.tokens / 1000).toFixed(1)}k tokens
                    </span>
                  </div>
                  <div className="h-2.5 bg-border rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${FEATURE_COLORS[idx % FEATURE_COLORS.length]}`}
                      style={{ width: `${(f.calls / maxCalls) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
