"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, TrendingUp, AlertTriangle, Users } from "lucide-react";
import MetricCard from "@/components/admin/MetricCard";
import DataTable, { Column } from "@/components/admin/DataTable";

interface BillingSummary {
  activeSubscriptions: number;
  cancellingThisPeriod: number;
  newSubscribersLast30d: number;
  freeUsers: number;
}

interface BillingSubscription {
  id: string;
  name: string | null;
  email: string;
  plan: string;
  stripePriceId: string | null;
  stripeCurrentPeriodEnd: string | null;
  stripeCancelAtPeriodEnd: boolean;
  createdAt: string;
}

interface BillingData {
  summary: BillingSummary;
  planBreakdown: Record<string, number>;
  recentSubscriptions: BillingSubscription[];
  subscriptionsPagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const PLAN_BADGE: Record<string, string> = {
  free: "bg-muted/15 text-slate",
  startup: "bg-blue-faint text-blue",
  growth: "bg-success/10 text-success",
  enterprise: "bg-blue-deep/10 text-blue-deep",
};

const SUBSCRIPTION_COLUMNS: Column<BillingSubscription>[] = [
  {
    key: "name",
    header: "User",
    render: (row) => (
      <div>
        <p className="font-semibold text-ink">{row.name ?? "—"}</p>
        <p className="text-xs text-muted">{row.email}</p>
      </div>
    ),
  },
  {
    key: "plan",
    header: "Plan",
    sortable: true,
    render: (row) => (
      <span
        className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${PLAN_BADGE[row.plan] ?? ""}`}
      >
        {row.plan}
      </span>
    ),
  },
  {
    key: "stripeCurrentPeriodEnd",
    header: "Period End",
    sortable: true,
    render: (row) => (
      <span className="text-xs text-muted font-medium">
        {row.stripeCurrentPeriodEnd
          ? new Date(row.stripeCurrentPeriodEnd).toLocaleDateString()
          : "—"}
      </span>
    ),
  },
  {
    key: "stripeCancelAtPeriodEnd",
    header: "Status",
    render: (row) =>
      row.stripeCancelAtPeriodEnd ? (
        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-warning/10 text-warning">
          Cancelling
        </span>
      ) : (
        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-success/10 text-success">
          Active
        </span>
      ),
  },
  {
    key: "createdAt",
    header: "Joined",
    sortable: true,
    render: (row) => (
      <span className="text-xs text-muted font-medium">
        {new Date(row.createdAt).toLocaleDateString()}
      </span>
    ),
  },
];

export default function BillingPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [planBreakdown, setPlanBreakdown] = useState<Record<string, number>>({});
  const [subscriptions, setSubscriptions] = useState<BillingSubscription[]>([]);
  const [subsTotal, setSubsTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      const res = await fetch(`/api/admin/billing?${params}`);
      if (res.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      const data: BillingData = await res.json();
      setSummary(data.summary);
      setPlanBreakdown(data.planBreakdown);
      setSubscriptions(data.recentSubscriptions);
      setSubsTotal(data.subscriptionsPagination?.total ?? data.recentSubscriptions.length);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [page, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loadError || !summary) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-slate text-sm font-medium">Failed to load billing data.</p>
      </div>
    );
  }

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

      {/* Recent subscriptions (paginated) */}
      <div>
        <div className="mb-3">
          <h2 className="text-sm font-bold text-ink">Paid Subscriptions</h2>
          <p className="text-xs text-muted font-medium mt-1">
            {subsTotal.toLocaleString()} total paid accounts
          </p>
        </div>
        <DataTable
          columns={SUBSCRIPTION_COLUMNS}
          data={subscriptions}
          getRowKey={(s) => s.id}
          isLoading={isLoading}
          searchable
          searchPlaceholder="Search by user name or email…"
          emptyMessage="No paid subscriptions found."
          serverPagination={{
            page,
            totalItems: subsTotal,
            pageSize: 50,
            onPageChange: setPage,
          }}
        />
      </div>
    </div>
  );
}
