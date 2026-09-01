"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import DataTable, { Column } from "@/components/admin/DataTable";
import { CheckCircle2, XCircle, Trash2 } from "lucide-react";

interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  plan: string;
  aiCreditsUsed: number;
  createdAt: string;
  emailVerified: string | null;
  scheduledDeletion: string | null;
  stripeSubscriptionId: string | null;
  _count: { ownedWorkspaces: number; sessions: number };
}

const PLAN_BADGE: Record<string, string> = {
  free: "bg-muted/15 text-slate",
  startup: "bg-blue-faint text-blue",
  growth: "bg-success/10 text-success",
  enterprise: "bg-blue-deep/10 text-blue-deep",
};

const COLUMNS: Column<AdminUser>[] = [
  {
    key: "name",
    header: "Name",
    sortable: true,
    render: (row) => (
      <div>
        <p className="font-semibold text-ink text-sm">{row.name ?? "—"}</p>
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
        className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${PLAN_BADGE[row.plan] ?? "bg-muted/10 text-slate"}`}
      >
        {row.plan}
      </span>
    ),
  },
  {
    key: "emailVerified",
    header: "Verified",
    render: (row) =>
      row.emailVerified ? (
        <CheckCircle2 className="w-4 h-4 text-success" />
      ) : (
        <XCircle className="w-4 h-4 text-muted" />
      ),
  },
  {
    key: "aiCreditsUsed",
    header: "AI Credits",
    sortable: true,
  },
  {
    key: "_count",
    header: "Workspaces",
    render: (row) => row._count.ownedWorkspaces,
  },
  {
    key: "scheduledDeletion",
    header: "GDPR",
    render: (row) =>
      row.scheduledDeletion ? (
        <span className="flex items-center gap-1 text-xs font-semibold text-warning">
          <Trash2 className="w-3.5 h-3.5" />
          {new Date(row.scheduledDeletion).toLocaleDateString()}
        </span>
      ) : (
        <span className="text-xs text-muted font-medium">—</span>
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

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [planFilter, setPlanFilter] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (planFilter) params.set("plan", planFilter);
      const res = await fetch(`/api/admin/users?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setUsers(data.users);
      setTotal(data.pagination.total);
    } finally {
      setIsLoading(false);
    }
  }, [page, planFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink tracking-tight">Users</h1>
          <p className="text-sm text-slate font-medium mt-1">
            {total.toLocaleString()} registered accounts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-slate uppercase tracking-wide">
            Plan
          </label>
          <select
            value={planFilter}
            onChange={(e) => {
              setPlanFilter(e.target.value);
              setPage(1);
            }}
            className="bg-white border border-border rounded-xl px-3 py-2 text-xs font-medium text-ink cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue"
          >
            <option value="">All plans</option>
            <option value="free">Free</option>
            <option value="startup">Startup</option>
            <option value="growth">Growth</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>
      </div>

      <DataTable
        columns={COLUMNS}
        data={users}
        getRowKey={(u) => u.id}
        isLoading={isLoading}
        searchable
        searchPlaceholder="Search by name or email…"
        pageSize={50}
        onRowClick={(u) => router.push(`/admin/users/${u.id}`)}
        emptyMessage="No users found."
      />
    </div>
  );
}
