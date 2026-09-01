import { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Users,
  Target,
  CheckSquare,
  FileText,
  ExternalLink,
} from "lucide-react";

export const metadata: Metadata = { title: "Workspace Details" };

interface WorkspaceDetail {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  storageUsedBytes: string;
  owner: { id: string; name: string | null; email: string; plan: string };
  members: Array<{
    id: string;
    role: string;
    joinedAt: string;
    user: { id: string; name: string | null; email: string };
  }>;
  goals: Array<{
    id: string;
    title: string;
    status: string;
    healthScore: number;
    createdAt: string;
  }>;
  invites: Array<{
    id: string;
    email: string;
    role: string;
    expiresAt: string;
  }>;
  _count: {
    members: number;
    goals: number;
    tasks: number;
    documents: number;
    boardItems: number;
    activityLogs: number;
  };
}

async function getWorkspaceDetail(id: string): Promise<WorkspaceDetail | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("admin_session")?.value;
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  try {
    const res = await fetch(`${baseUrl}/api/admin/workspaces/${id}`, {
      headers: { Cookie: `admin_session=${sessionCookie}` },
      cache: "no-store",
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const data = await res.json();
    return data.workspace;
  } catch {
    return null;
  }
}

function formatBytes(bytes: string): string {
  const n = parseInt(bytes, 10);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const PLAN_BADGE: Record<string, string> = {
  free: "bg-muted/15 text-slate",
  startup: "bg-blue-faint text-blue",
  growth: "bg-success/10 text-success",
  enterprise: "bg-blue-deep/10 text-blue-deep",
};

const ROLE_BADGE: Record<string, string> = {
  admin: "bg-blue-faint text-blue",
  pm: "bg-success/10 text-success",
  eng: "bg-warning/10 text-warning",
  exec: "bg-blue-deep/10 text-blue-deep",
  marketing: "bg-cyan/10 text-cyan",
};

const GOAL_STATUS_BADGE: Record<string, string> = {
  draft: "bg-muted/15 text-slate",
  active: "bg-blue-faint text-blue",
  completed: "bg-success/10 text-success",
  cancelled: "bg-danger/10 text-danger",
};

export default async function WorkspaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workspace = await getWorkspaceDetail(id);

  if (!workspace) notFound();

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Back link */}
      <Link
        href="/admin/workspaces"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate hover:text-ink transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Workspaces
      </Link>

      {/* Header */}
      <div className="bg-white border border-border rounded-2xl p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-ink">{workspace.name}</h1>
              <Link
                href={`/workspace/${workspace.id}`}
                target="_blank"
                className="text-muted hover:text-blue transition-colors cursor-pointer"
                aria-label="Open workspace"
              >
                <ExternalLink className="w-4 h-4" />
              </Link>
            </div>
            <p className="text-sm text-muted font-medium">{workspace.slug}</p>
            <p className="text-xs text-muted font-medium mt-1">
              Created {new Date(workspace.createdAt).toLocaleDateString()}
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {[
              { icon: Users, label: "Members", value: workspace._count.members },
              { icon: Target, label: "Goals", value: workspace._count.goals },
              { icon: CheckSquare, label: "Tasks", value: workspace._count.tasks },
              { icon: FileText, label: "Docs", value: workspace._count.documents },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="text-center">
                <p className="text-xs text-muted font-medium flex items-center gap-1 justify-center">
                  <Icon className="w-3 h-3" /> {label}
                </p>
                <p className="text-lg font-extrabold text-ink">{value}</p>
              </div>
            ))}
            <div className="text-center col-span-2 sm:col-span-1">
              <p className="text-xs text-muted font-medium">Storage</p>
              <p className="text-lg font-extrabold text-ink">
                {formatBytes(workspace.storageUsedBytes)}
              </p>
            </div>
            <div className="text-center col-span-2 sm:col-span-1">
              <p className="text-xs text-muted font-medium">Activity</p>
              <p className="text-lg font-extrabold text-ink">
                {workspace._count.activityLogs.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Owner */}
      <div className="bg-white border border-border rounded-2xl p-5 shadow-sm">
        <h2 className="text-sm font-bold text-ink mb-3">Owner</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-ink">{workspace.owner.name ?? "—"}</p>
            <p className="text-xs text-muted">{workspace.owner.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${PLAN_BADGE[workspace.owner.plan] ?? ""}`}
            >
              {workspace.owner.plan}
            </span>
            <Link
              href={`/admin/users/${workspace.owner.id}`}
              className="text-xs font-semibold text-blue hover:underline cursor-pointer"
            >
              View User
            </Link>
          </div>
        </div>
      </div>

      {/* Members */}
      <div className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-bold text-ink">
            Members ({workspace.members.length})
          </h2>
        </div>
        {workspace.members.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-muted font-medium">No members.</p>
        ) : (
          <div className="divide-y divide-border">
            {workspace.members.map((m) => (
              <div key={m.id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-ink">
                    {m.user.name ?? "—"}
                  </p>
                  <p className="text-xs text-muted">{m.user.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${ROLE_BADGE[m.role] ?? "bg-muted/10 text-slate"}`}
                  >
                    {m.role}
                  </span>
                  <span className="text-xs text-muted font-medium">
                    {new Date(m.joinedAt).toLocaleDateString()}
                  </span>
                  <Link
                    href={`/admin/users/${m.user.id}`}
                    className="text-xs font-semibold text-blue hover:underline cursor-pointer"
                  >
                    View
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Goals */}
      <div className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-bold text-ink">
            Recent Goals ({workspace._count.goals} total)
          </h2>
        </div>
        {workspace.goals.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-muted font-medium">No goals.</p>
        ) : (
          <div className="divide-y divide-border">
            {workspace.goals.map((g) => (
              <div key={g.id} className="px-5 py-3 flex items-center justify-between gap-4">
                <p className="text-sm font-semibold text-ink truncate">{g.title}</p>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${GOAL_STATUS_BADGE[g.status] ?? ""}`}
                  >
                    {g.status}
                  </span>
                  <span className="text-xs text-muted font-medium">
                    Health: {g.healthScore}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pending Invites */}
      {workspace.invites.length > 0 && (
        <div className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-bold text-ink">
              Pending Invites ({workspace.invites.length})
            </h2>
          </div>
          <div className="divide-y divide-border">
            {workspace.invites.map((inv) => (
              <div key={inv.id} className="px-5 py-3 flex items-center justify-between gap-4">
                <p className="text-sm font-medium text-ink">{inv.email}</p>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold uppercase bg-muted/10 text-slate">
                    {inv.role}
                  </span>
                  <span className="text-xs text-muted font-medium">
                    Expires {new Date(inv.expiresAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
