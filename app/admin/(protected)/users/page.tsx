"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import DataTable, { Column } from "@/components/admin/DataTable";
import { CheckCircle2, XCircle, Trash2, AlertTriangle, RefreshCw, Mail } from "lucide-react";
import { useConfirm } from "@/context/ConfirmContext";

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
        <CheckCircle2 className="w-4 h-4 text-success" aria-label="Verified" />
      ) : (
        <XCircle className="w-4 h-4 text-muted" aria-label="Unverified" />
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
          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
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
  const { confirm: confirmDialog } = useConfirm();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [planFilter, setPlanFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSyncingResend, setIsSyncingResend] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const isFirstSearchEffect = useRef(true);

  // Debounce search query and reset page to 1 when search changes
  useEffect(() => {
    if (isFirstSearchEffect.current) {
      isFirstSearchEffect.current = false;
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleSyncResend = async () => {
    const ok = await confirmDialog({
      title: "Sync all users to Resend?",
      description:
        "This will trigger a bulk audience synchronization for all registered accounts in Resend. Continue?",
      confirmLabel: "Sync to Resend",
    });
    if (!ok) return;

    setIsSyncingResend(true);
    setSyncFeedback(null);
    try {
      const res = await fetch("/api/admin/users/sync-resend", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.details || data.error || "Sync request failed");
      }
      const { synced, skipped, failed, total: syncTotal } = data.summary;
      setSyncFeedback({
        type: "success",
        message: `Resend Sync Complete: ${synced} synced, ${skipped} skipped, ${failed} failed (of ${syncTotal} total).`,
      });
      setTimeout(() => setSyncFeedback(null), 6000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSyncFeedback({
        type: "error",
        message: `Sync failed: ${msg}`,
      });
    } finally {
      setIsSyncingResend(false);
    }
  };

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (planFilter) params.set("plan", planFilter);
      if (debouncedQuery) params.set("q", debouncedQuery);
      const res = await fetch(`/api/admin/users?${params}`);
      if (res.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!res.ok) {
        setError(
          `Failed to load users (HTTP ${res.status}). Please try again in a moment.`
        );
        return;
      }
      const data = await res.json();
      setUsers(data.users);
      setTotal(data.pagination.total);
    } catch {
      setError("Network error while loading users. Check your connection and retry.");
    } finally {
      setIsLoading(false);
    }
  }, [page, planFilter, debouncedQuery, router]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return (
    <div className="space-y-6 max-w-7xl">
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 p-4 rounded-xl border border-warning/30 bg-warning/5 text-warning text-sm font-medium"
        >
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold">Could not load users</p>
            <p className="text-xs text-slate mt-0.5">{error}</p>
          </div>
          <button
            type="button"
            onClick={fetchUsers}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-warning hover:bg-warning/80 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            Retry
          </button>
        </div>
      )}
      {syncFeedback && (
        <div
          role={syncFeedback.type === "error" ? "alert" : "status"}
          className={`flex items-start gap-3 p-4 rounded-xl border text-sm font-medium transition-all ${
            syncFeedback.type === "success"
              ? "border-success/30 bg-success/10 text-success"
              : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          {syncFeedback.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-success" aria-hidden="true" />
          ) : (
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-danger" aria-hidden="true" />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold">{syncFeedback.message}</p>
          </div>
        </div>
      )}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink tracking-tight">Users</h1>
          <p className="text-sm text-slate font-medium mt-1">
            {total.toLocaleString()} {debouncedQuery || planFilter ? "matching" : "registered"} account
            {total === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSyncResend()}
            disabled={isSyncingResend}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue hover:bg-blue-hover text-white text-xs font-semibold shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSyncingResend ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Mail className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            {isSyncingResend ? "Syncing to Resend..." : "Sync to Resend"}
          </button>
          <div className="flex items-center gap-2">
            <label
              htmlFor="admin-users-plan-filter"
              className="text-xs font-bold text-slate uppercase tracking-wide"
            >
              Plan
            </label>
            <select
              id="admin-users-plan-filter"
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
      </div>

      <DataTable
        columns={COLUMNS}
        data={users}
        getRowKey={(u) => u.id}
        isLoading={isLoading}
        searchable
        searchableKeys={["email", "name"]}
        onSearchChange={setSearchInput}
        searchPlaceholder="Search by name or email…"
        onRowClick={(u) => router.push(`/admin/users/${u.id}`)}
        emptyMessage="No users found."
        serverPagination={{
          page,
          totalItems: total,
          pageSize: 50,
          onPageChange: setPage,
        }}
      />
    </div>
  );
}
