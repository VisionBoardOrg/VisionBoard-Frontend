import { Metadata } from "next";
import { cookies } from "next/headers";
import {
  Users,
  Building2,
  CheckSquare,
  Target,
  Sparkles,
  CreditCard,
  Trash2,
  TrendingUp,
} from "lucide-react";
import MetricCard from "@/components/admin/MetricCard";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export const metadata: Metadata = { title: "Overview" };

interface OverviewData {
  kpis: {
    totalUsers: number;
    newUsersLast30d: number;
    newUsersLast7d: number;
    totalWorkspaces: number;
    totalTasks: number;
    totalGoals: number;
    activeSubscriptions: number;
    scheduledDeletions: number;
    aiTokensLast30d: number;
    aiCallsLast30d: number;
  };
  planBreakdown: Record<string, number>;
  recentActivity: Array<{
    id: string;
    entityType: string;
    action: string;
    createdAt: string;
    user?: { name?: string; email: string } | null;
    workspace?: { name: string; slug: string } | null;
  }>;
}

async function getOverviewData(): Promise<OverviewData | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("admin_session")?.value;

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  try {
    const res = await fetch(`${baseUrl}/api/admin/overview`, {
      headers: { Cookie: `admin_session=${sessionCookie}` },
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

const PLAN_COLORS: Record<string, string> = {
  free: "bg-muted/20 text-slate",
  startup: "bg-blue-faint text-blue",
  growth: "bg-success/10 text-success",
  enterprise: "bg-blue-deep/10 text-blue-deep",
};

export default async function OverviewPage() {
  const data = await getOverviewData();

  if (!data) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-slate text-sm font-medium">Failed to load overview data.</p>
      </div>
    );
  }

  const { kpis, planBreakdown, recentActivity } = data;

  return (
    <div className="space-y-8 max-w-7xl">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-ink tracking-tight">Platform Overview</h1>
        <p className="text-sm text-slate font-medium mt-1">
          Live snapshot of platform health and user activity.
        </p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Users"
          value={kpis.totalUsers.toLocaleString()}
          trend={{ direction: "up", label: `+${kpis.newUsersLast30d} this month`, positive: true }}
          icon={Users}
        />
        <MetricCard
          title="Workspaces"
          value={kpis.totalWorkspaces.toLocaleString()}
          subtitle="All time"
          icon={Building2}
        />
        <MetricCard
          title="Tasks Created"
          value={kpis.totalTasks.toLocaleString()}
          subtitle="All time"
          icon={CheckSquare}
        />
        <MetricCard
          title="Goals Tracked"
          value={kpis.totalGoals.toLocaleString()}
          subtitle="All time"
          icon={Target}
        />
        <MetricCard
          title="Paid Subs"
          value={kpis.activeSubscriptions.toLocaleString()}
          trend={{
            direction: kpis.activeSubscriptions > 0 ? "up" : "flat",
            label: "Active subscriptions",
            positive: true,
          }}
          icon={CreditCard}
          iconColor="text-success"
        />
        <MetricCard
          title="AI Calls (30d)"
          value={kpis.aiCallsLast30d.toLocaleString()}
          subtitle={`${(kpis.aiTokensLast30d / 1000).toFixed(0)}k tokens`}
          icon={Sparkles}
          iconColor="text-blue"
        />
        <MetricCard
          title="New Users (7d)"
          value={kpis.newUsersLast7d.toLocaleString()}
          trend={{ direction: "up", label: "Last 7 days", positive: true }}
          icon={TrendingUp}
          iconColor="text-success"
        />
        <MetricCard
          title="Pending Deletions"
          value={kpis.scheduledDeletions}
          subtitle="GDPR scheduled"
          icon={Trash2}
          iconColor={kpis.scheduledDeletions > 0 ? "text-warning" : "text-muted"}
        />
      </div>

      {/* Plan breakdown */}
      <div className="bg-white border border-border rounded-2xl p-5 shadow-sm">
        <h2 className="text-sm font-bold text-ink mb-4">Plan Distribution</h2>
        <div className="flex flex-wrap gap-3">
          {Object.entries(planBreakdown).map(([plan, count]) => (
            <div
              key={plan}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border border-border ${PLAN_COLORS[plan] ?? "bg-muted/10 text-slate"}`}
            >
              <span className="text-xs font-bold uppercase tracking-wide">{plan}</span>
              <span className="text-sm font-extrabold">{count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity Feed */}
      <div className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-bold text-ink">24h Activity Stream</h2>
        </div>
        <div className="divide-y divide-border max-h-96 overflow-y-auto">
          {recentActivity.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted font-medium">
              No activity in the last 24 hours.
            </p>
          ) : (
            recentActivity.map((log) => (
              <div key={log.id} className="px-5 py-3 flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-light mt-2 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-ink truncate">
                    <span className="text-muted font-medium">{log.entityType}</span>
                    {" · "}
                    <span className="capitalize">{log.action.replace(/_/g, " ")}</span>
                  </p>
                  <p className="text-xs text-muted font-medium truncate">
                    {log.user?.name ?? log.user?.email ?? "System"}
                    {log.workspace ? ` · ${log.workspace.name}` : ""}
                  </p>
                </div>
                <span className="text-xs text-muted font-medium whitespace-nowrap shrink-0">
                  {timeAgo(log.createdAt)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
