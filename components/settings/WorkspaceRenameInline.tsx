"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X, Loader2 } from "lucide-react";

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
  const [editing, setEditing]   = useState(false);
  const [value, setValue]       = useState(currentName);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [saved, setSaved]       = useState(false);

  async function handleSave() {
    if (!value.trim() || value.trim() === currentName) {
      setEditing(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: value.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Rename failed. Please try again.");
      } else {
        setSaved(true);
        setEditing(false);
        setTimeout(() => setSaved(false), 2000);
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
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <p className="text-xs font-semibold text-ink mb-1">Workspace name</p>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-ink">{value}</span>
            {saved && (
              <span className="text-xs text-success flex items-center gap-1">
                <Check size={12} /> Saved
              </span>
            )}
          </div>
        </div>
        {canRename && (
          <button
            onClick={() => { setEditing(true); setError(""); }}
            className="flex items-center gap-1.5 text-xs text-blue hover:text-blue-mid font-medium transition-colors cursor-pointer px-3 py-2 rounded-xl hover:bg-blue-faint"
          >
            <Pencil size={13} /> Rename
          </button>
        )}
        {!canRename && (
          <span className="text-xs text-muted">Only admins can rename</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-ink">Workspace name</p>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          autoFocus
          maxLength={80}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") handleCancel();
          }}
          className="flex-1 border border-blue rounded-xl px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-blue/30 transition-colors"
          placeholder="Workspace name"
        />
        <button
          onClick={handleSave}
          disabled={loading || !value.trim()}
          className="flex items-center gap-1.5 bg-blue text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-blue-mid transition-colors disabled:opacity-50 cursor-pointer"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          Save
        </button>
        <button
          onClick={handleCancel}
          disabled={loading}
          className="p-2.5 rounded-xl border border-border text-slate hover:bg-offwhite transition-colors cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
