"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X, Loader2, Copy, Download, AlertCircle } from "lucide-react";
import { useClipboard } from "@/hooks/useClipboard";

interface WorkspaceRenameInlineProps {
  workspaceId: string;
  currentName: string;
  canRename: boolean;
}

export function WorkspaceRenameInline({
  workspaceId,
  currentName,
  canRename,
}: WorkspaceRenameInlineProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setValue(currentName);
  }, [currentName]);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  async function handleSave() {
    const trimmed = value.trim();
    if (!trimmed || trimmed === currentName) {
      setValue(currentName);
      setEditing(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Rename failed. Please try again.");
      } else {
        setValue(trimmed);
        setSaved(true);
        setEditing(false);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
        router.refresh();
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleCancel() {
    setValue(currentName);
    setEditing(false);
    setError("");
  }

  if (!editing) {
    return (
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-ink mb-1">Workspace name</p>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-ink truncate">{value || currentName}</span>
            {saved && (
              <span role="status" className="text-xs text-success flex items-center gap-1 shrink-0">
                <Check size={12} aria-hidden="true" /> Saved
              </span>
            )}
          </div>
        </div>
        {canRename ? (
          <button
            type="button"
            onClick={() => { setEditing(true); setError(""); }}
            className="flex items-center gap-1.5 text-xs text-blue hover:text-blue-mid font-medium transition-colors cursor-pointer px-3 py-2 rounded-xl hover:bg-blue-faint self-start sm:self-auto"
          >
            <Pencil size={13} aria-hidden="true" /> Rename
          </button>
        ) : (
          <span className="text-xs text-muted">Only admins can rename</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label htmlFor="workspace-rename-input" className="block text-xs font-semibold text-ink">
        Workspace name
      </label>
      <div className="flex items-center gap-2">
        <input
          id="workspace-rename-input"
          type="text"
          value={value}
          autoFocus
          maxLength={80}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
              handleSave();
            }
            if (e.key === "Escape") handleCancel();
          }}
          className="flex-1 border border-blue rounded-xl px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-blue/30 transition-colors"
          placeholder="Workspace name"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={loading || !value.trim()}
          className="flex items-center gap-1.5 bg-blue text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-blue-mid transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {loading ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
          Save
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={loading}
          aria-label="Cancel rename"
          className="p-2.5 rounded-xl border border-border text-slate hover:bg-offwhite transition-colors cursor-pointer"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}

/** Copyable developer workspace ID chip for workspace settings. */
export function WorkspaceIdCopy({ workspaceId }: { workspaceId: string }) {
  const { copied, copyError, copy } = useClipboard();

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink">Developer Info · Workspace ID</p>
          <code className="text-xs font-mono text-muted break-all">{workspaceId}</code>
        </div>
        <button
          type="button"
          onClick={() => void copy(workspaceId)}
          aria-label="Copy workspace ID"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-slate hover:text-ink hover:bg-offwhite transition-colors self-start sm:self-auto shrink-0 cursor-pointer"
        >
          {copied ? <Check size={12} className="text-emerald-600" aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
          {copied ? "Copied" : "Copy ID"}
        </button>
      </div>
      {copyError && (
        <p role="alert" className="text-xs text-danger mt-1.5">{copyError}</p>
      )}
    </div>
  );
}

/** Interactive workspace JSON export trigger with loading & error feedback. */
export function WorkspaceExportButton({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string;
  workspaceName: string;
}) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/export`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to export workspace data.");
        return;
      }
      const blob = await res.blob();
      const safeName = workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workspace";
      const filename =
        res.headers.get("Content-Disposition")?.match(/filename="(.+?)"/)?.[1] ??
        `visionboard-${safeName}-export.json`;
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      setError("Network error while exporting workspace data. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-offwhite border border-border">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">Export {workspaceName}</p>
          <p className="text-xs text-muted mt-0.5">
            A portable JSON file with all goals, milestones, tasks, documents, and sprints for this workspace.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl border border-border text-ink hover:bg-white transition-colors shrink-0 disabled:opacity-50 cursor-pointer"
        >
          {exporting ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Download size={13} aria-hidden="true" />}
          {exporting ? "Exporting…" : "Export"}
        </button>
      </div>
      {error && (
        <div role="alert" className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">
          <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
