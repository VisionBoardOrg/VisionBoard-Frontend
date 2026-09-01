"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import DataTable, { Column } from "@/components/admin/DataTable";

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

  const fetchWorkspaces = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/workspaces?limit=100");
      if (!res.ok) return;
      const data = await res.json();
      setWorkspaces(data.workspaces);
      setTotal(data.pagination.total);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  return (
    <div className="space-y-6 max-w-7xl">
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
        pageSize={50}
        onRowClick={(ws) => router.push(`/admin/workspaces/${ws.id}`)}
        emptyMessage="No workspaces found."
      />
    </div>
  );
}
