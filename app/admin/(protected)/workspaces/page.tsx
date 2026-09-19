"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import DataTable, { Column } from "@/components/admin/DataTable";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface AdminWorkspace {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  storageUsedBytes: string;
  owner: { id: string; name: string | null; email: string; plan: string };
  _count: { members: number; goals: number; tasks: number; documents: number };
}

const PLAN_BADGE: Record<string, string> = {
  free: "bg-muted/15 text-slate",
  startup: "bg-blue-faint text-blue",
  growth: "bg-success/10 text-success",
  enterprise: "bg-blue-deep/10 text-blue-deep",
};

function formatBytes(bytes: string): string {
  const n = parseInt(bytes, 10);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const COLUMNS: Column<AdminWorkspace>[] = [
  {
    key: "name",
    header: "Workspace",
    sortable: true,
    render: (row) => (
      <div>
        <p className="font-semibold text-ink text-sm">{row.name}</p>
        <p className="text-xs text-muted">{row.slug}</p>
      </div>
    ),
  },
  {
    key: "owner",
    header: "Owner",
    render: (row) => (
      <div>
        <p className="text-sm font-medium text-ink">{row.owner.name ?? "—"}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <p className="text-xs text-muted">{row.owner.email}</p>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${PLAN_BADGE[row.owner.plan] ?? ""}`}
          >
            {row.owner.plan}
          </span>
        </div>
      </div>
    ),
  },
  {
    key: "_count",
    header: "Members",
    render: (row) => (
      <span className="text-sm font-medium text-ink">{row._count.members}</span>
    ),
  },
  {
    key: "goals",
    header: "Goals",
    render: (row) => row._count.goals,
  },
  {
    key: "tasks",
    header: "Tasks",
    render: (row) => row._count.tasks,
  },
  {
    key: "storageUsedBytes",
    header: "Storage",
    sortable: true,
    render: (row) => (
      <span className="text-xs font-medium text-muted">{formatBytes(row.storageUsedBytes)}</span>
    ),
  },
  {
    key: "createdAt",
    header: "Created",
    sortable: true,
    render: (row) => (
      <span className="text-xs text-muted font-medium">
        {new Date(row.createdAt).toLocaleDateString()}
      </span>
    ),
  },
];

export default function WorkspacesPage() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<AdminWorkspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkspaces = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      const res = await fetch(`/api/admin/workspaces?${params}`);
      if (res.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!res.ok) {
        setError(
          `Failed to load workspaces (HTTP ${res.status}). Please try again in a moment.`
        );
        return;
      }
      const data = await res.json();
      setWorkspaces(data.workspaces);
      setTotal(data.pagination.total);
    } catch {
      setError("Network error while loading workspaces. Check your connection and retry.");
    } finally {
      setIsLoading(false);
    }
  }, [page, router]);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  return (
    <div className="space-y-6 max-w-7xl">
      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-warning/30 bg-warning/5 text-warning text-sm font-medium">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold">Could not load workspaces</p>
            <p className="text-xs text-slate mt-0.5">{error}</p>
          </div>
          <button
            onClick={fetchWorkspaces}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-warning hover:bg-warning/80 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}
      <div>
        <h1 className="text-2xl font-bold text-ink tracking-tight">Workspace Fleet</h1>
        <p className="text-sm text-slate font-medium mt-1">
          {total.toLocaleString()} workspaces across all accounts
        </p>
      </div>

      <DataTable
        columns={COLUMNS}
        data={workspaces}
        getRowKey={(ws) => ws.id}
        isLoading={isLoading}
        searchable
        searchPlaceholder="Search by name or slug…"
        onRowClick={(ws) => router.push(`/admin/workspaces/${ws.id}`)}
        emptyMessage="No workspaces found."
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
