import { Metadata } from "next";
import { cookies } from "next/headers";
import { CreditCard, TrendingUp, AlertTriangle, Users } from "lucide-react";
import MetricCard from "@/components/admin/MetricCard";

export const metadata: Metadata = { title: "Billing" };

interface BillingData {
  summary: {
    activeSubscriptions: number;
    cancellingThisPeriod: number;
    newSubscribersLast30d: number;
    freeUsers: number;
  };
  planBreakdown: Record<string, number>;
  recentSubscriptions: Array<{
    id: string;
    name: string | null;
    email: string;
    plan: string;
    stripePriceId: string | null;
    stripeCurrentPeriodEnd: string | null;
    stripeCancelAtPeriodEnd: boolean;
    createdAt: string;
  }>;
}

async function getBillingData(): Promise<BillingData | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("admin_session")?.value;
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  try {
    const res = await fetch(`${baseUrl}/api/admin/billing`, {
      headers: { Cookie: `admin_session=${sessionCookie}` },
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

const PLAN_BADGE: Record<string, string> = {
  free: "bg-muted/15 text-slate",
  startup: "bg-blue-faint text-blue",
  growth: "bg-success/10 text-success",
  enterprise: "bg-blue-deep/10 text-blue-deep",
};

export default async function BillingPage() {
  const data = await getBillingData();

  if (!data) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-slate text-sm font-medium">Failed to load billing data.</p>
      </div>
    );
  }

  const { summary, planBreakdown, recentSubscriptions } = data;
  const paidTotal = summary.activeSubscriptions;
  const allUsers = Object.values(planBreakdown).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-ink tracking-tight">Billing & Revenue</h1>
        <p className="text-sm text-slate font-medium mt-1">
          Stripe subscription telemetry and plan breakdown.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard
          title="Active Subs"
          value={paidTotal.toLocaleString()}
          icon={CreditCard}
          iconColor="text-success"
        />
        <MetricCard
          title="New Subs (30d)"
          value={summary.newSubscribersLast30d.toLocaleString()}
          trend={{ direction: "up", label: "Last 30 days", positive: true }}
          icon={TrendingUp}
        />
        <MetricCard
          title="Cancelling"
          value={summary.cancellingThisPeriod.toLocaleString()}
          trend={
            summary.cancellingThisPeriod > 0
              ? { direction: "down", label: "At period end", positive: false }
              : undefined
          }
          icon={AlertTriangle}
          iconColor={summary.cancellingThisPeriod > 0 ? "text-warning" : "text-muted"}
        />
        <MetricCard
          title="Free Users"
          value={summary.freeUsers.toLocaleString()}
          subtitle={`${allUsers > 0 ? Math.round((summary.freeUsers / allUsers) * 100) : 0}% of total`}
          icon={Users}
          iconColor="text-muted"
        />
      </div>

      {/* Plan breakdown chart */}
      <div className="bg-white border border-border rounded-2xl p-5 shadow-sm">
        <h2 className="text-sm font-bold text-ink mb-4">Plan Distribution</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {["free", "startup", "growth", "enterprise"].map((plan) => {
            const count = planBreakdown[plan] ?? 0;
            const pct = allUsers > 0 ? Math.round((count / allUsers) * 100) : 0;
            return (
              <div
                key={plan}
                className="bg-offwhite rounded-xl p-4 border border-border"
              >
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${PLAN_BADGE[plan] ?? ""}`}
                >
                  {plan}
                </span>
                <p className="text-2xl font-extrabold text-ink mt-2">
                  {count.toLocaleString()}
                </p>
                <p className="text-xs text-muted font-medium">{pct}% of users</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent subscriptions */}
      <div className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-bold text-ink">Recent Paid Subscriptions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-offwhite/60">
                <th className="px-4 py-3 text-left text-xs font-bold text-slate uppercase tracking-wide">User</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate uppercase tracking-wide">Plan</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate uppercase tracking-wide">Period End</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate uppercase tracking-wide">Joined</th>
              </tr>
            </thead>
            <tbody>
              {recentSubscriptions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted font-medium">
                    No paid subscriptions found.
                  </td>
                </tr>
              ) : (
                recentSubscriptions.map((sub) => (
                  <tr key={sub.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink">{sub.name ?? "—"}</p>
                      <p className="text-xs text-muted">{sub.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${PLAN_BADGE[sub.plan] ?? ""}`}
                      >
                        {sub.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted font-medium">
                      {sub.stripeCurrentPeriodEnd
                        ? new Date(sub.stripeCurrentPeriodEnd).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {sub.stripeCancelAtPeriodEnd ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-warning/10 text-warning">
                          Cancelling
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-success/10 text-success">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted font-medium">
                      {new Date(sub.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
