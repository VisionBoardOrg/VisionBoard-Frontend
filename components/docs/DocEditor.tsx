"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  FileCode2,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Save,
  ArrowLeft,
  Loader2,
  ImagePlus,
  Upload,
  Trash2,
  Undo2,
  Redo2,
  Link2,
  Unlink,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { ImportDocButton } from "@/components/docs/ImportDocButton";
import { useConfirm } from "@/context/ConfirmContext";
import { useToast } from "@/context/ToastContext";

interface DocEditorProps {
  workspaceId: string;
  initialData?: {
    id?: string;
    title: string;
    content: unknown;
    linkedGoalId?: string | null;
    linkedMilestoneId?: string | null;
    linkedTaskId?: string | null;
  };
  goals?: { id: string; title: string }[];
  milestones?: { id: string; title: string; goalTitle?: string | null }[];
  tasks?: { id: string; title: string }[];
}

export function DocEditor({
  workspaceId,
  initialData,
  goals = [],
  milestones = [],
  tasks = [],
}: DocEditorProps) {
  const router = useRouter();
  const { confirm: confirmDialog } = useConfirm();
  const { toast } = useToast();

  const [docId, setDocId] = useState<string | undefined>(initialData?.id);
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [linkedGoalId, setLinkedGoalId] = useState<string>(initialData?.linkedGoalId ?? "");
  const [linkedMilestoneId, setLinkedMilestoneId] = useState<string>(
    initialData?.linkedMilestoneId ?? ""
  );
  const [linkedTaskId, setLinkedTaskId] = useState<string>(initialData?.linkedTaskId ?? "");
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "unsaved">("idle");
  const [error, setError] = useState("");
  const [imgUploading, setImgUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Inline link editor popover state
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [linkUrlInput, setLinkUrlInput] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false },
      }),
      Placeholder.configure({ placeholder: "Start writing your document…" }),
      Image.configure({ inline: false, allowBase64: true }),
    ],
    content: (initialData?.content as object) ?? "",
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none focus:outline-none min-h-[300px] text-ink leading-relaxed p-4 " +
          "[&_img]:rounded-xl [&_img]:max-w-full [&_img]:my-3 [&_img]:border [&_img]:border-border",
      },
    },
    onUpdate: () => {
      setIsDirty(true);
      setSaveState("unsaved");
    },
  });

  const performSave = useCallback(
    async (opts?: { silent?: boolean }) => {
      const trimmedTitle = title.trim();
      if (!trimmedTitle) {
        if (!opts?.silent) {
          setError("Please enter a title for the document.");
        }
        return;
      }
      if (isSavingRef.current) return;

      isSavingRef.current = true;
      setSaving(true);
      setSaveState("saving");
      setError("");

      const jsonContent = editor?.getJSON();
      const isEditing = Boolean(docId);
      const url = isEditing ? `/api/documents/${docId}` : "/api/documents";
      const method = isEditing ? "PATCH" : "POST";

      try {
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            title: trimmedTitle,
            content: jsonContent,
            linkedGoalId: linkedGoalId || null,
            linkedMilestoneId: linkedMilestoneId || null,
            linkedTaskId: linkedTaskId || null,
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || "Failed to save document.");
          setSaveState("unsaved");
        } else {
          setIsDirty(false);
          setSaveState("saved");
          if (!isEditing && data.document?.id) {
            setDocId(data.document.id);
            router.replace(`/workspace/${workspaceId}/docs/${data.document.id}`);
          }
          if (!opts?.silent) {
            toast({
              title: isEditing ? "Document saved" : "Document created",
              type: "success",
              duration: 2500,
            });
          }
        }
      } catch {
        setError("Network error while saving.");
        setSaveState("unsaved");
      } finally {
        isSavingRef.current = false;
        setSaving(false);
      }
    },
    [title, docId, editor, workspaceId, linkedGoalId, linkedMilestoneId, linkedTaskId, router, toast]
  );

  // Debounced autosave (2.5s after last edit for existing docs with a non-empty title)
  useEffect(() => {
    if (!isDirty || !docId || !title.trim()) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      void performSave({ silent: true });
    }, 2500);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [isDirty, docId, title, linkedGoalId, linkedMilestoneId, linkedTaskId, performSave]);

  // Cmd/Ctrl+S keyboard shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
        void performSave();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [performSave]);

  // Warn browser tab close/reload when dirty
  useEffect(() => {
    if (!isDirty) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  async function handleBackToDocs() {
    if (isDirty) {
      const leave = await confirmDialog({
        title: "Leave with unsaved changes?",
        description: "You have unsaved edits in this document. Leave anyway and discard them?",
        confirmLabel: "Leave & discard",
        cancelLabel: "Stay in editor",
        danger: true,
      });
      if (!leave) return;
    }
    router.push(`/workspace/${workspaceId}/docs`);
  }

  // ── Image insertion ──
  function triggerImagePicker() {
    fileInputRef.current?.click();
  }

  const IMAGE_MAX_DIMENSION = 1600;
  const IMAGE_TARGET_BYTES = 300 * 1024;

  async function downscaleToDataUrl(file: File): Promise<string> {
    const originalDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    if (file.type === "image/svg+xml" || originalDataUrl.length <= IMAGE_TARGET_BYTES) {
      return originalDataUrl;
    }

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = originalDataUrl;
    });

    const scale = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return originalDataUrl;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    for (let quality = 0.85; quality >= 0.6; quality -= 0.1) {
      const out = canvas.toDataURL("image/webp", quality);
      if (out.length <= IMAGE_TARGET_BYTES) return out;
    }
    return canvas.toDataURL("image/webp", 0.6);
  }

  async function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editor) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file (JPEG, PNG, GIF, WebP).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be smaller than 5 MB.");
      return;
    }

    setImgUploading(true);
    setError("");

    try {
      const dataUrl = await downscaleToDataUrl(file);
      editor.chain().focus().setImage({ src: dataUrl, alt: file.name }).run();
    } catch {
      setError("Failed to load image. Please try again.");
    } finally {
      setImgUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleOpenLinkPopover() {
    if (!editor) return;
    const currentHref = (editor.getAttributes("link").href as string | undefined) ?? "";
    setLinkUrlInput(currentHref);
    setLinkPopoverOpen((prev) => !prev);
  }

  function handleApplyLink(e: React.FormEvent) {
    e.preventDefault();
    if (!editor) return;
    const raw = linkUrlInput.trim();
    if (!raw) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setLinkPopoverOpen(false);
      return;
    }
    const safeUrl =
      raw.startsWith("http://") ||
      raw.startsWith("https://") ||
      raw.startsWith("mailto:") ||
      raw.startsWith("/")
        ? raw
        : `https://${raw}`;
    editor.chain().focus().extendMarkRange("link").setLink({ href: safeUrl }).run();
    setLinkPopoverOpen(false);
  }

  async function handleDelete() {
    if (!docId || deleting) return;
    const ok = await confirmDialog({
      title: `Delete "${title || "Untitled Document"}"?`,
      description:
        "This document will be permanently deleted along with all its comments. This cannot be undone.",
      confirmLabel: "Delete document",
      danger: true,
    });
    if (!ok) return;

    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/documents/${docId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to delete document.");
      } else {
        setIsDirty(false);
        toast({ title: "Document deleted", type: "success" });
        router.push(`/workspace/${workspaceId}/docs`);
        router.refresh();
      }
    } catch {
      setError("Network error while deleting.");
    } finally {
      setDeleting(false);
    }
  }

  if (!editor) {
    return (
      <div
        aria-busy="true"
        aria-label="Loading document editor"
        className="max-w-4xl mx-auto bg-white border border-border rounded-2xl p-6 min-h-[420px] animate-pulse space-y-4"
      >
        <div className="h-7 w-1/3 rounded-lg bg-border/70" />
        <div className="h-9 w-full rounded-lg bg-border/40" />
        <div className="space-y-3 pt-4">
          <div className="h-3 w-full rounded bg-border/40" />
          <div className="h-3 w-11/12 rounded bg-border/40" />
          <div className="h-3 w-4/5 rounded bg-border/40" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Top controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => void handleBackToDocs()}
          className="flex items-center gap-1.5 text-sm text-slate hover:text-ink transition-colors cursor-pointer"
        >
          <ArrowLeft size={16} aria-hidden="true" /> Back to docs
        </button>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Save status badge */}
          <span
            role="status"
            aria-live="polite"
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${
              saveState === "saving"
                ? "bg-blue-faint text-blue border-blue-light"
                : saveState === "unsaved" || isDirty
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : "bg-emerald-50 text-emerald-700 border-emerald-200"
            }`}
          >
            {saveState === "saving" ? (
              <>
                <Loader2 size={11} className="animate-spin" aria-hidden="true" /> Saving…
              </>
            ) : saveState === "unsaved" || isDirty ? (
              <>
                <Circle size={8} className="fill-amber-500 text-amber-500" aria-hidden="true" />
                Unsaved changes
              </>
            ) : (
              <>
                <CheckCircle2 size={11} aria-hidden="true" /> Saved
              </>
            )}
          </span>

          {/* Delete — only shown when editing an existing doc */}
          {docId && (
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleting}
              title="Delete document"
              className="flex items-center gap-1.5 text-sm text-danger hover:bg-red-50 border border-red-200 rounded-xl px-3 py-2 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {deleting ? (
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 size={14} aria-hidden="true" />
              )}
              Delete
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
              void performSave();
            }}
            disabled={saving}
            className="flex items-center gap-2 bg-blue text-white rounded-xl px-5 py-2 text-sm font-semibold hover:bg-blue-mid transition-colors disabled:opacity-50 cursor-pointer"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            ) : (
              <Save size={14} aria-hidden="true" />
            )}
            {docId ? "Save" : "Create document"}
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 text-danger text-sm p-3 rounded-xl"
        >
          {error}
        </div>
      )}

      {/* Document container */}
      <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
        {/* Entity linking toolbar */}
        <div className="p-4 border-b border-border bg-offwhite flex flex-wrap gap-3 sm:gap-4 items-center">
          <div className="flex items-center gap-2 min-w-0 max-w-full">
            <label
              htmlFor="doc-link-goal"
              className="text-xs font-medium text-slate shrink-0"
            >
              Link to Goal:
            </label>
            <select
              id="doc-link-goal"
              value={linkedGoalId}
              onChange={(e) => {
                setLinkedGoalId(e.target.value);
                setIsDirty(true);
                setSaveState("unsaved");
              }}
              className="text-xs bg-white border border-border rounded-lg px-2.5 py-1.5 text-ink focus:outline-none focus:ring-1 focus:ring-blue cursor-pointer max-w-full min-w-0 truncate"
            >
              <option value="">None</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 min-w-0 max-w-full">
            <label
              htmlFor="doc-link-milestone"
              className="text-xs font-medium text-slate shrink-0"
            >
              Link to Milestone:
            </label>
            <select
              id="doc-link-milestone"
              value={linkedMilestoneId}
              onChange={(e) => {
                setLinkedMilestoneId(e.target.value);
                setIsDirty(true);
                setSaveState("unsaved");
              }}
              className="text-xs bg-white border border-border rounded-lg px-2.5 py-1.5 text-ink focus:outline-none focus:ring-1 focus:ring-blue cursor-pointer max-w-full min-w-0 truncate"
            >
              <option value="">None</option>
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.goalTitle ? `${m.title} (${m.goalTitle})` : m.title}
                </option>
              ))}
            </select>
          </div>

          {tasks.length > 0 && (
            <div className="flex items-center gap-2 min-w-0 max-w-full">
              <label
                htmlFor="doc-link-task"
                className="text-xs font-medium text-slate shrink-0"
              >
                Link to Task:
              </label>
              <select
                id="doc-link-task"
                value={linkedTaskId}
                onChange={(e) => {
                  setLinkedTaskId(e.target.value);
                  setIsDirty(true);
                  setSaveState("unsaved");
                }}
                className="text-xs bg-white border border-border rounded-lg px-2.5 py-1.5 text-ink focus:outline-none focus:ring-1 focus:ring-blue cursor-pointer max-w-full min-w-0 truncate"
              >
                <option value="">None</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Title */}
        <div className="px-6 pt-6 pb-2">
          <input
            type="text"
            aria-label="Document title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setIsDirty(true);
              setSaveState("unsaved");
            }}
            placeholder="Untitled Document"
            className="w-full text-2xl font-bold text-ink placeholder:text-muted focus:outline-none"
          />
        </div>

        {/* Formatting toolbar */}
        <div className="px-6 py-2 border-b border-border flex flex-wrap items-center gap-0.5 relative">
          <ToolbarBtn
            active={false}
            disabled={!editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}
            title="Undo"
          >
            <Undo2 size={15} aria-hidden="true" />
          </ToolbarBtn>
          <ToolbarBtn
            active={false}
            disabled={!editor.can().redo()}
            onClick={() => editor.chain().focus().redo().run()}
            title="Redo"
          >
            <Redo2 size={15} aria-hidden="true" />
          </ToolbarBtn>

          <div className="w-px h-4 bg-border mx-1" />

          <ToolbarBtn
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Bold"
          >
            <Bold size={15} aria-hidden="true" />
          </ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Italic"
          >
            <Italic size={15} aria-hidden="true" />
          </ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive("strike")}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            title="Strikethrough"
          >
            <Strikethrough size={15} aria-hidden="true" />
          </ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive("code")}
            onClick={() => editor.chain().focus().toggleCode().run()}
            title="Inline code"
          >
            <Code size={15} aria-hidden="true" />
          </ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive("codeBlock")}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            title="Code block"
          >
            <FileCode2 size={15} aria-hidden="true" />
          </ToolbarBtn>

          <div className="w-px h-4 bg-border mx-1" />

          <ToolbarBtn
            active={editor.isActive("heading", { level: 1 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            title="Heading 1"
          >
            <Heading1 size={15} aria-hidden="true" />
          </ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive("heading", { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title="Heading 2"
          >
            <Heading2 size={15} aria-hidden="true" />
          </ToolbarBtn>

          <div className="w-px h-4 bg-border mx-1" />

          <ToolbarBtn
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Bullet list"
          >
            <List size={15} aria-hidden="true" />
          </ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Numbered list"
          >
            <ListOrdered size={15} aria-hidden="true" />
          </ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            title="Quote"
          >
            <Quote size={15} aria-hidden="true" />
          </ToolbarBtn>

          <div className="w-px h-4 bg-border mx-1" />

          <ToolbarBtn
            active={editor.isActive("link") || linkPopoverOpen}
            onClick={handleOpenLinkPopover}
            title="Insert or edit link"
          >
            <Link2 size={15} aria-hidden="true" />
          </ToolbarBtn>
          {editor.isActive("link") && (
            <ToolbarBtn
              active={false}
              onClick={() => editor.chain().focus().unsetLink().run()}
              title="Remove link"
            >
              <Unlink size={15} aria-hidden="true" />
            </ToolbarBtn>
          )}

          {/* Image insert button */}
          <ToolbarBtn
            active={false}
            onClick={triggerImagePicker}
            title="Insert image from device"
            loading={imgUploading}
          >
            {imgUploading ? (
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
            ) : (
              <ImagePlus size={15} aria-hidden="true" />
            )}
          </ToolbarBtn>

          <div className="w-px h-4 bg-border mx-1" />

          {/* Import doc button */}
          <ImportDocButton
            workspaceId={workspaceId}
            variant="toolbar"
            onError={setError}
            onBeforeImport={async () => {
              if (!isDirty) return true;
              return confirmDialog({
                title: "Import a new document?",
                description:
                  "Importing will open a new document and discard unsaved changes in this editor.",
                confirmLabel: "Continue to import",
                cancelLabel: "Stay here",
                danger: true,
              });
            }}
          />

          {/* Inline link URL editor */}
          {linkPopoverOpen && (
            <form
              onSubmit={handleApplyLink}
              className="w-full mt-2 pt-2 border-t border-border/60 flex flex-wrap items-center gap-2"
            >
              <input
                type="url"
                value={linkUrlInput}
                onChange={(e) => setLinkUrlInput(e.target.value)}
                placeholder="https://example.com"
                aria-label="Link URL"
                autoFocus
                className="flex-1 min-w-[200px] text-xs border border-border rounded-lg px-2.5 py-1.5 text-ink focus:outline-none focus:border-blue"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-blue text-white text-xs font-semibold rounded-lg hover:bg-blue-mid cursor-pointer"
              >
                Apply link
              </button>
              <button
                type="button"
                onClick={() => setLinkPopoverOpen(false)}
                className="px-2.5 py-1.5 text-xs text-muted hover:text-ink cursor-pointer"
              >
                Cancel
              </button>
            </form>
          )}
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label="Upload image"
          onChange={handleImageFile}
        />

        {/* Editor content */}
        <div className="px-2 py-4">
          <EditorContent editor={editor} />
        </div>

        {/* Hints */}
        <div className="px-6 pb-4 flex flex-col gap-1">
          <p className="text-[11px] text-muted">
            Tip: Press <kbd className="px-1 py-0.5 bg-offwhite border border-border rounded text-[10px]">Ctrl/Cmd + S</kbd> to save anytime. Changes to existing documents autosave automatically.
          </p>
          <p className="text-[11px] text-muted">
            Click <ImagePlus size={10} className="inline" aria-hidden="true" /> to insert an image
            from your device (max 5 MB). Click{" "}
            <Upload size={10} className="inline" aria-hidden="true" /> to import a{" "}
            <strong>.pdf, .docx, .xlsx, .csv, .txt, .md, .html, .json,</strong> or{" "}
            <strong>.rtf</strong> file as a new document.
          </p>
        </div>
      </div>
    </div>
  );
}

function ToolbarBtn({
  active,
  onClick,
  title,
  children,
  loading,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={loading || disabled}
      className={`p-1.5 rounded-md text-slate hover:text-ink hover:bg-offwhite transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
        active ? "bg-blue-faint text-blue" : ""
      }`}
    >
      {children}
    </button>
  );
}
