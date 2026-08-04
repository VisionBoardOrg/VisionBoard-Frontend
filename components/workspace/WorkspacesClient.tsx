"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/reusables/Logo";
import {
  Building2, Plus, Trash2, Pencil, Check, X, Loader2,
  Users, Target, FileText, Crown, ExternalLink, ChevronRight,
  AlertTriangle, LogOut,
} from "lucide-react";

interface WorkspaceItem {
  id: string;
  name: string;
  slug: string;
  plan: string;
  role: string;
  isOwner: boolean;
  ownerName: string;
  memberCount: number;
  goalCount: number;
  docCount: number;
  joinedAt: string;
}

interface WorkspacesClientProps {
  workspaces: WorkspaceItem[];
  ownedCount: number;
  workspaceLimit: number | null;
  plan: string;
  userId: string;
}

const PLAN_COLORS: Record<string, string> = {
  free: "bg-slate-100 text-slate-600",
  startup: "bg-cyan-50 text-cyan-700 border border-cyan-200",
  growth: "bg-blue-faint text-blue border border-blue-light",
  enterprise: "bg-violet-50 text-violet-700 border border-violet-200",
};
const PLAN_NAMES: Record<string, string> = {
  free: "Free", startup: "Startup", growth: "Growth", enterprise: "Enterprise",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-emerald-50 text-emerald-700",
  pm: "bg-blue-faint text-blue",
  exec: "bg-violet-50 text-violet-700",
  eng: "bg-cyan-50 text-cyan-700",
  marketing: "bg-amber-50 text-amber-600",
};

export function WorkspacesClient({
  workspaces: initialWorkspaces,
  ownedCount,
  workspaceLimit,
  plan,
  userId,
}: WorkspacesClientProps) {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState(initialWorkspaces);

  // ── New workspace modal ──
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<"pm" | "exec" | "eng" | "marketing" | "admin">("pm");
  const [newTemplate, setNewTemplate] = useState<"okr_board" | "product_roadmap" | "quarterly_plan" | "sprint_board">("okr_board");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // ── Rename state (per workspace) ──
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameLoading, setRenameLoading] = useState(false);
  const [renameError, setRenameError] = useState("");

  // ── Delete confirmation ──
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const atLimit = workspaceLimit !== null && ownedCount >= workspaceLimit;

  // ── Create workspace ──
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), role: newRole, template: newTemplate }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error || "Failed to create workspace.");
      } else {
        router.push(`/workspace/${data.workspace.id}/board`);
      }
    } catch {
      setCreateError("Network error. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  // ── Rename workspace ──
  function startRename(ws: WorkspaceItem) {
    setRenamingId(ws.id);
    setRenameValue(ws.name);
    setRenameError("");
  }

  async function commitRename(id: string) {
    if (!renameValue.trim()) return;
    setRenameLoading(true);
    setRenameError("");
    try {
      const res = await fetch(`/api/workspaces/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRenameError(data.error || "Rename failed.");
      } else {
        setWorkspaces((prev) =>
          prev.map((w) => (w.id === id ? { ...w, name: data.workspace.name } : w))
        );
        setRenamingId(null);
      }
    } catch {
      setRenameError("Network error.");
    } finally {
      setRenameLoading(false);
    }
  }

  // ── Delete workspace ──
  async function handleDelete(id: string) {
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/workspaces/${id}`, { method: "DELETE" });
      if (res.ok) {
        setWorkspaces((prev) => prev.filter((w) => w.id !== id));
        setDeleteId(null);
        // If no workspaces left, redirect to onboarding
        if (workspaces.length === 1) router.push("/onboarding");
        else router.refresh();
      }
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-offwhite">
      {/* Top nav */}
      <header className="h-14 border-b border-border bg-white flex items-center px-6 gap-4">
        <Link href="/dashboard">
          <Logo markSize={28} textSize={16} />
        </Link>
        <span className="text-muted text-sm">/</span>
        <span className="text-sm font-semibold text-ink">Workspaces</span>
        <div className="flex-1" />
        <Link href="/dashboard" className="text-sm text-slate hover:text-ink transition-colors flex items-center gap-1.5">
          <ChevronRight size={14} className="rotate-180" /> Dashboard
        </Link>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-ink">Your Workspaces</h1>
            <p className="text-slate text-sm mt-1">
              {workspaceLimit
                ? `${ownedCount} of ${workspaceLimit} owned workspaces used on the ${PLAN_NAMES[plan] ?? plan} plan.`
                : `${workspaces.length} workspace${workspaces.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <button
            onClick={() => {
              if (atLimit) return;
              setShowNew(true);
              setCreateError("");
              setNewName("");
            }}
            disabled={atLimit}
            className="flex items-center gap-2 bg-blue text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-blue-mid transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <Plus size={15} /> New workspace
          </button>
        </div>

        {/* Plan limit warning */}
        {atLimit && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-500" />
            <div>
              You&apos;ve reached the {workspaceLimit}-workspace limit on the {PLAN_NAMES[plan]} plan.{" "}
              <Link href="/pricing" className="font-semibold underline hover:no-underline">Upgrade your plan</Link> to create more.
            </div>
          </div>
        )}

        {/* Workspace grid */}
        {workspaces.length === 0 ? (
          <div className="bg-white rounded-2xl border border-border p-12 text-center">
            <Building2 size={40} className="text-muted mx-auto mb-4" />
            <h3 className="font-semibold text-ink">No workspaces yet</h3>
            <p className="text-sm text-slate mt-1 mb-5">Create your first workspace to get started.</p>
            <button
              onClick={() => setShowNew(true)}
              className="inline-flex items-center gap-2 bg-blue text-white rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-blue-mid transition-colors cursor-pointer"
            >
              <Plus size={14} /> Create workspace
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {workspaces.map((ws) => (
              <div
                key={ws.id}
                className="bg-white rounded-2xl border border-border p-5 flex flex-col gap-4 hover:border-blue/30 transition-all"
              >
                {/* Card header */}
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-faint flex items-center justify-center shrink-0">
                    <Building2 size={18} className="text-blue" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {renamingId === ws.id ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <input
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitRename(ws.id);
                              if (e.key === "Escape") setRenamingId(null);
                            }}
                            autoFocus
                            maxLength={80}
                            className="flex-1 text-sm font-semibold text-ink border border-blue rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue/30"
                          />
                          <button
                            onClick={() => commitRename(ws.id)}
                            disabled={renameLoading || !renameValue.trim()}
                            className="p-1.5 rounded-lg bg-blue text-white hover:bg-blue-mid transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            {renameLoading ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                          </button>
                          <button
                            onClick={() => setRenamingId(null)}
                            className="p-1.5 rounded-lg text-slate hover:bg-offwhite transition-colors cursor-pointer"
                          >
                            <X size={13} />
                          </button>
                        </div>
                        {renameError && <p className="text-xs text-danger">{renameError}</p>}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <h2 className="font-semibold text-ink truncate">{ws.name}</h2>
                        {(ws.isOwner || ws.role === "admin") && (
                          <button
                            onClick={() => startRename(ws)}
                            className="shrink-0 p-1 rounded text-muted hover:text-ink hover:bg-offwhite transition-colors cursor-pointer"
                            title="Rename workspace"
                          >
                            <Pencil size={12} />
                          </button>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${PLAN_COLORS[ws.plan] ?? "bg-slate-100 text-slate-600"}`}>
                        {PLAN_NAMES[ws.plan] ?? ws.plan}
                      </span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${ROLE_COLORS[ws.role] ?? "bg-slate-100 text-slate-600"}`}>
                        {ws.role}
                      </span>
                      {ws.isOwner && (
                        <span className="flex items-center gap-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
                          <Crown size={9} /> Owner
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { icon: Users, label: "Members", value: ws.memberCount },
                    { icon: Target, label: "Goals", value: ws.goalCount },
                    { icon: FileText, label: "Docs", value: ws.docCount },
                  ].map(({ icon: Icon, label, value }) => (
                    <div key={label} className="bg-offwhite rounded-xl px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1 text-muted mb-0.5">
                        <Icon size={11} />
                        <span className="text-[10px]">{label}</span>
                      </div>
                      <div className="text-sm font-bold text-ink">{value}</div>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1 border-t border-border">
                  <Link
                    href={`/workspace/${ws.id}/board`}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-blue text-white rounded-xl py-2 text-xs font-semibold hover:bg-blue-mid transition-colors"
                  >
                    Open <ExternalLink size={11} />
                  </Link>
                  <Link
                    href={`/workspace/${ws.id}/settings`}
                    className="flex items-center justify-center gap-1.5 border border-border text-slate rounded-xl py-2 px-3 text-xs font-semibold hover:bg-offwhite transition-colors"
                  >
                    Settings
                  </Link>
                  {ws.isOwner ? (
                    <button
                      onClick={() => setDeleteId(ws.id)}
                      className="p-2 rounded-xl text-muted hover:text-danger hover:bg-red-50 border border-border transition-colors cursor-pointer"
                      title="Delete workspace"
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : (
                    <button
                      onClick={async () => {
                        if (!confirm("Leave this workspace?")) return;
                        // Leave = remove own membership
                        await fetch(`/api/workspaces/${ws.id}/members/leave`, { method: "POST" });
                        setWorkspaces((prev) => prev.filter((w) => w.id !== ws.id));
                        router.refresh();
                      }}
                      className="p-2 rounded-xl text-muted hover:text-warning hover:bg-amber-50 border border-border transition-colors cursor-pointer"
                      title="Leave workspace"
                    >
                      <LogOut size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ── New workspace modal ── */}
      {showNew && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-border shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-blue-faint text-blue"><Plus size={16} /></div>
                <div>
                  <h3 className="font-bold text-ink">New Workspace</h3>
                  <p className="text-xs text-muted">Set up your team&apos;s new workspace.</p>
                </div>
              </div>
              <button onClick={() => setShowNew(false)} className="text-muted hover:text-ink transition-colors cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {createError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-danger">
                  {createError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">Workspace name</label>
                <input
                  type="text"
                  required
                  maxLength={80}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Acme Corp"
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-0.5">Your dashboard view</label>
                <p className="text-[11px] text-muted mb-1.5">You&apos;ll always be an <strong>Admin</strong> of any workspace you create.</p>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as typeof newRole)}
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue cursor-pointer"
                >
                  <option value="pm">Product Manager</option>
                  <option value="exec">Executive / Strategy</option>
                  <option value="eng">Engineering / Ops</option>
                  <option value="marketing">Marketing / Growth</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">Starting template</label>
                <select
                  value={newTemplate}
                  onChange={(e) => setNewTemplate(e.target.value as typeof newTemplate)}
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue cursor-pointer"
                >
                  <option value="okr_board">OKR Board</option>
                  <option value="product_roadmap">Product Roadmap</option>
                  <option value="quarterly_plan">Quarterly Plan</option>
                  <option value="sprint_board">Sprint Board</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNew(false)}
                  disabled={creating}
                  className="px-4 py-2 text-sm text-slate hover:bg-offwhite rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newName.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue text-white rounded-xl text-sm font-semibold hover:bg-blue-mid transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {creating && <Loader2 size={14} className="animate-spin" />}
                  {creating ? "Creating…" : "Create workspace"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete confirmation modal ── */}
      {deleteId && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-border shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mx-auto">
              <Trash2 size={22} className="text-danger" />
            </div>
            <div className="text-center">
              <h3 className="font-bold text-ink text-lg">Delete workspace?</h3>
              <p className="text-sm text-slate mt-2">
                This will permanently delete{" "}
                <strong>{workspaces.find((w) => w.id === deleteId)?.name}</strong>{" "}
                and all its goals, tasks, and documents. This cannot be undone.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                disabled={deleteLoading}
                className="flex-1 border border-border rounded-xl py-2.5 text-sm font-medium text-slate hover:bg-offwhite transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteId)}
                disabled={deleteLoading}
                className="flex-1 bg-danger text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
              >
                {deleteLoading && <Loader2 size={14} className="animate-spin" />}
                {deleteLoading ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
