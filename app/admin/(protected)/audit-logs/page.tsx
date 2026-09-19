"use client";

import { useEffect, useState, useCallback } from "react";
import DataTable, { Column } from "@/components/admin/DataTable";
import { useRouter } from "next/navigation";
import { AlertTriangle, RefreshCw } from "lucide-react";

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

interface AuditLog {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  createdAt: string;
  user?: { id: string; name: string | null; email: string } | null;
  workspace?: { id: string; name: string; slug: string } | null;
}

const COLUMNS: Column<AuditLog>[] = [
  {
    key: "entityType",
    header: "Entity",
    render: (row) => (
      <span className="px-2 py-0.5 bg-blue-faint text-blue rounded-md text-xs font-bold uppercase tracking-wide">
        {row.entityType}
      </span>
    ),
  },
  {
    key: "action",
    header: "Action",
    sortable: true,
    render: (row) => (
      <span className="text-sm font-semibold text-ink capitalize">
        {row.action.replace(/_/g, " ")}
      </span>
    ),
  },
  {
    key: "user",
    header: "Actor",
    render: (row) =>
      row.user ? (
        <div>
          <p className="text-sm font-medium text-ink">{row.user.name ?? "—"}</p>
          <p className="text-xs text-muted">{row.user.email}</p>
        </div>
      ) : (
        <span className="text-xs text-muted font-medium">System</span>
      ),
  },
  {
    key: "workspace",
    header: "Workspace",
    render: (row) =>
      row.workspace ? (
        <div>
          <p className="text-sm font-medium text-ink">{row.workspace.name}</p>
          <p className="text-xs text-muted">{row.workspace.slug}</p>
        </div>
      ) : (
        <span className="text-xs text-muted font-medium">—</span>
      ),
  },
  {
    key: "entityId",
    header: "Entity ID",
    render: (row) => (
      <span className="font-mono text-xs text-muted">{row.entityId.slice(0, 12)}…</span>
    ),
  },
  {
    key: "createdAt",
    header: "When",
    sortable: true,
    render: (row) => (
      <span className="text-xs text-muted font-medium">
        {timeAgo(row.createdAt)}
      </span>
    ),
  },
];

export default function AuditLogsPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [entityTypeFilter, setEntityTypeFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (entityTypeFilter) params.set("entityType", entityTypeFilter);
      const res = await fetch(`/api/admin/audit-logs?${params}`);
      if (res.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!res.ok) {
        setError(
          `Failed to load audit logs (HTTP ${res.status}). Please try again in a moment.`
        );
        return;
      }
      const data = await res.json();
      setLogs(data.logs);
      setTotal(data.pagination.total);
    } catch {
      setError("Network error while loading audit logs. Check your connection and retry.");
    } finally {
      setIsLoading(false);
    }
  }, [page, entityTypeFilter, router]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const entityTypes = [...new Set(logs.map((l) => l.entityType))].sort();

  return (
    <div className="space-y-6 max-w-7xl">
      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-warning/30 bg-warning/5 text-warning text-sm font-medium">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold">Could not load audit logs</p>
            <p className="text-xs text-slate mt-0.5">{error}</p>
          </div>
          <button
            onClick={fetchLogs}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-warning hover:bg-warning/80 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink tracking-tight">Audit Logs</h1>
          <p className="text-sm text-slate font-medium mt-1">
            {total.toLocaleString()} activity records
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-slate uppercase tracking-wide">
            Entity
          </label>
          <select
            value={entityTypeFilter}
            onChange={(e) => {
              setEntityTypeFilter(e.target.value);
              setPage(1);
            }}
            className="bg-white border border-border rounded-xl px-3 py-2 text-xs font-medium text-ink cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue"
          >
            <option value="">All types</option>
            {entityTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <DataTable
        columns={COLUMNS}
        data={logs}
        getRowKey={(l) => l.id}
        isLoading={isLoading}
        searchable
        searchPlaceholder="Search by action or entity type…"
        emptyMessage="No audit logs found."
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
