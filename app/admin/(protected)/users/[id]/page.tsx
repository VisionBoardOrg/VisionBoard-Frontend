import { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Building2,
  Sparkles,
  FileText,
  MessageSquare,
  Trash2,
} from "lucide-react";
import UserEditPanel from "./UserEditPanel";

export const metadata: Metadata = { title: "User Details" };

interface UserDetail {
  id: string;
  name: string | null;
  email: string;
  plan: string;
  aiCreditsUsed: number;
  createdAt: string;
  updatedAt: string;
  emailVerified: string | null;
  scheduledDeletion: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  stripeCurrentPeriodEnd: string | null;
  stripeCancelAtPeriodEnd: boolean;
  image: string | null;
  ownedWorkspaces: Array<{
    id: string;
    name: string;
    slug: string;
    createdAt: string;
    _count: { members: number; goals: number; tasks: number };
  }>;
  memberships: Array<{
    id: string;
    role: string;
    joinedAt: string;
    workspace: { id: string; name: string; slug: string };
  }>;
  _count: { sessions: number; aiLogs: number; comments: number; documents: number };
}

async function getUserDetail(id: string): Promise<UserDetail | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("admin_session")?.value;
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  try {
    const res = await fetch(`${baseUrl}/api/admin/users/${id}`, {
      headers: { Cookie: `admin_session=${sessionCookie}` },
      cache: "no-store",
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const data = await res.json();
    return data.user;
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

const ROLE_BADGE: Record<string, string> = {
  admin: "bg-blue-faint text-blue",
  pm: "bg-success/10 text-success",
  eng: "bg-warning/10 text-warning",
  exec: "bg-blue-deep/10 text-blue-deep",
  marketing: "bg-cyan/10 text-cyan",
};

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getUserDetail(id);

  if (!user) notFound();

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Back link */}
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate hover:text-ink transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Users
      </Link>

      {/* Header */}
      <div className="bg-white border border-border rounded-2xl p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.image}
                alt={user.name ?? user.email}
                className="w-14 h-14 rounded-2xl object-cover border border-border"
              />
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-blue-faint flex items-center justify-center text-blue font-extrabold text-xl">
                {(user.name ?? user.email)[0].toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold text-ink">{user.name ?? "—"}</h1>
              <p className="text-sm text-muted font-medium">{user.email}</p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${PLAN_BADGE[user.plan] ?? ""}`}
                >
                  {user.plan}
                </span>
                {user.emailVerified ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-success">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-semibold text-warning">
                    <XCircle className="w-3.5 h-3.5" /> Unverified
                  </span>
                )}
                {user.scheduledDeletion && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-danger">
                    <Trash2 className="w-3.5 h-3.5" />
                    Deletion: {new Date(user.scheduledDeletion).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="text-center">
              <p className="text-xs text-muted font-medium flex items-center gap-1 justify-center">
                <Sparkles className="w-3 h-3" /> AI Calls
              </p>
              <p className="text-lg font-extrabold text-ink">{user._count.aiLogs}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted font-medium flex items-center gap-1 justify-center">
                <FileText className="w-3 h-3" /> Docs
              </p>
              <p className="text-lg font-extrabold text-ink">{user._count.documents}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted font-medium flex items-center gap-1 justify-center">
                <MessageSquare className="w-3 h-3" /> Comments
              </p>
              <p className="text-lg font-extrabold text-ink">{user._count.comments}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted font-medium flex items-center gap-1 justify-center">
                <Building2 className="w-3 h-3" /> Workspaces
              </p>
              <p className="text-lg font-extrabold text-ink">{user.ownedWorkspaces.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Edit Panel */}
        <UserEditPanel
          userId={user.id}
          currentPlan={user.plan}
          currentAiCredits={user.aiCreditsUsed}
          scheduledDeletion={user.scheduledDeletion}
        />

        {/* Billing */}
        <div className="bg-white border border-border rounded-2xl p-5 shadow-sm">
          <h2 className="text-sm font-bold text-ink mb-4">Billing</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted font-medium">Subscription ID</span>
              <span className="font-mono text-xs text-ink truncate max-w-[180px]">
                {user.stripeSubscriptionId ?? "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted font-medium">Price ID</span>
              <span className="font-mono text-xs text-ink truncate max-w-[180px]">
                {user.stripePriceId ?? "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted font-medium">Period End</span>
              <span className="text-ink font-medium">
                {user.stripeCurrentPeriodEnd
                  ? new Date(user.stripeCurrentPeriodEnd).toLocaleDateString()
                  : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted font-medium">Cancelling</span>
              <span className={user.stripeCancelAtPeriodEnd ? "text-warning font-semibold" : "text-ink font-medium"}>
                {user.stripeCancelAtPeriodEnd ? "Yes" : "No"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted font-medium">Joined</span>
              <span className="text-ink font-medium">
                {new Date(user.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Workspaces */}
      <div className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-bold text-ink">Owned Workspaces</h2>
        </div>
        {user.ownedWorkspaces.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted font-medium">
            No owned workspaces.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {user.ownedWorkspaces.map((ws) => (
              <div key={ws.id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-ink">{ws.name}</p>
                  <p className="text-xs text-muted">{ws.slug}</p>
                </div>
                <div className="flex items-center gap-4 text-xs font-medium text-muted">
                  <span>{ws._count.members} members</span>
                  <span>{ws._count.goals} goals</span>
                  <span>{ws._count.tasks} tasks</span>
                  <Link
                    href={`/admin/workspaces/${ws.id}`}
                    className="text-blue font-semibold hover:underline cursor-pointer"
                  >
                    View
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Memberships */}
      {user.memberships.length > 0 && (
        <div className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-bold text-ink">Workspace Memberships</h2>
          </div>
          <div className="divide-y divide-border">
            {user.memberships.map((m) => (
              <div key={m.id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-ink">{m.workspace.name}</p>
                  <p className="text-xs text-muted">{m.workspace.slug}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${ROLE_BADGE[m.role] ?? "bg-muted/10 text-slate"}`}
                  >
                    {m.role}
                  </span>
                  <span className="text-xs text-muted font-medium">
                    {new Date(m.joinedAt).toLocaleDateString()}
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
