"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, X } from "lucide-react";

interface ImportDocButtonProps {
  workspaceId: string;
  /** Visual variant: "button" (default, full pill) | "toolbar" (icon-only toolbar button) */
  variant?: "button" | "toolbar";
  /** Optional callback to propagate errors to parent (especially in toolbar variant) */
  onError?: (msg: string) => void;
  /** Optional gate called before opening file picker (e.g. warn if current doc has unsaved changes) */
  onBeforeImport?: () => Promise<boolean> | boolean;
}

const ACCEPTED =
  ".pdf,.docx,.doc,.xlsx,.xls,.csv,.tsv,.txt,.text,.md,.markdown,.json,.html,.htm,.rtf";
const ALLOWED_EXTS = [
  "pdf",
  "docx",
  "doc",
  "xlsx",
  "xls",
  "csv",
  "tsv",
  "txt",
  "text",
  "md",
  "markdown",
  "json",
  "html",
  "htm",
  "rtf",
];

export function ImportDocButton({
  workspaceId,
  variant = "button",
  onError,
  onBeforeImport,
}: ImportDocButtonProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function reportError(msg: string) {
    setError(msg);
    onError?.(msg);
  }

  async function openPicker() {
    setError("");
    if (onBeforeImport) {
      const proceed = await onBeforeImport();
      if (!proceed) return;
    }
    inputRef.current?.click();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset so the same file can be re-imported
    if (inputRef.current) inputRef.current.value = "";

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTS.includes(ext)) {
      reportError(
        "Unsupported file format. Please upload a .pdf, .docx, .xlsx, .csv, .txt, .md, .html, .json, or .rtf file."
      );
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      reportError("File must be smaller than 15 MB.");
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

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        reportError(data.error ?? "Import failed. Please try again.");
        return;
      }

      // Navigate to the newly created document
      router.push(`/workspace/${workspaceId}/docs/${data.document.id}`);
      router.refresh();
    } catch {
      reportError("Network error. Please try again.");
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
          onClick={() => void openPicker()}
          disabled={loading}
          aria-label="Import document from device"
          title="Import document from device (.pdf, .docx, .xlsx, .csv, .txt, .md, .html, .json, .rtf)"
          className="p-1.5 rounded-md text-slate hover:text-ink hover:bg-offwhite transition-colors cursor-pointer disabled:opacity-50"
        >
          {loading ? (
            <Loader2 size={15} className="animate-spin" aria-hidden="true" />
          ) : (
            <Upload size={15} aria-hidden="true" />
          )}
        </button>
      ) : (
        /* Full pill button used on the docs list page */
        <button
          type="button"
          onClick={() => void openPicker()}
          disabled={loading}
          className="flex items-center gap-2 bg-white border border-border text-ink rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-offwhite transition-colors disabled:opacity-50 cursor-pointer"
        >
          {loading ? (
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          ) : (
            <Upload size={14} aria-hidden="true" />
          )}
          Import doc
        </button>
      )}

      {/* Inline error popover (only shown in "button" variant; toolbar errors go to DocEditor via onError) */}
      {error && variant === "button" && (
        <div
          role="alert"
          className="absolute top-full mt-1.5 right-0 flex items-start gap-2 text-xs text-danger bg-red-50 border border-red-200 rounded-xl px-3 py-2 shadow-md whitespace-normal w-max max-w-[280px] sm:max-w-sm z-20"
        >
          <span className="flex-1 leading-relaxed">{error}</span>
          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Dismiss import error"
            className="p-0.5 text-danger/70 hover:text-danger shrink-0 cursor-pointer"
          >
            <X size={13} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
