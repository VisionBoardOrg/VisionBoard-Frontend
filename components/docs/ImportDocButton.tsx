"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2 } from "lucide-react";

interface ImportDocButtonProps {
  workspaceId: string;
  /** Visual variant: "button" (default, full pill) | "toolbar" (icon-only toolbar button) */
  variant?: "button" | "toolbar";
}

const ACCEPTED = ".txt,.md,.docx";

export function ImportDocButton({ workspaceId, variant = "button" }: ImportDocButtonProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function openPicker() {
    setError("");
    inputRef.current?.click();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset so the same file can be re-imported
    if (inputRef.current) inputRef.current.value = "";

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["txt", "md", "docx"].includes(ext)) {
      setError("Only .txt, .md, and .docx files are supported.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("File must be smaller than 10 MB.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("workspaceId", workspaceId);

      const res = await fetch("/api/documents/import", {
        method: "POST",
        body: form,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Import failed. Please try again.");
        return;
      }

      // Navigate to the newly created document
      router.push(`/workspace/${workspaceId}/docs/${data.document.id}`);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="sr-only"
        aria-label="Import document from device"
        onChange={handleFile}
      />

      {variant === "toolbar" ? (
        /* Compact toolbar button used inside DocEditor */
        <button
          type="button"
          onClick={openPicker}
          disabled={loading}
          title="Import document from device (.txt, .md, .docx)"
          className="p-1.5 rounded-md text-slate hover:text-ink hover:bg-offwhite transition-colors cursor-pointer disabled:opacity-50"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
        </button>
      ) : (
        /* Full pill button used on the docs list page */
        <button
          type="button"
          onClick={openPicker}
          disabled={loading}
          className="flex items-center gap-2 bg-white border border-border text-ink rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-offwhite transition-colors disabled:opacity-50 cursor-pointer"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          Import doc
        </button>
      )}

      {/* Inline error toast (only shown in "button" variant; toolbar errors go to DocEditor) */}
      {error && variant === "button" && (
        <p className="absolute top-full mt-1.5 right-0 text-xs text-danger bg-red-50 border border-red-200 rounded-lg px-3 py-2 whitespace-nowrap z-10">
          {error}
        </p>
      )}
    </div>
  );
}
