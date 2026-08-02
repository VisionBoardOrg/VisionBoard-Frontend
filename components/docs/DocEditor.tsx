"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Bold, Italic, Strikethrough, Code, Heading1, Heading2,
  List, ListOrdered, Quote, Save, ArrowLeft, Loader2, ImagePlus, Upload, Trash2,
} from "lucide-react";
import Link from "next/link";
import { ImportDocButton } from "@/components/docs/ImportDocButton";

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
  milestones?: { id: string; title: string }[];
}

export function DocEditor({ workspaceId, initialData, goals = [], milestones = [] }: DocEditorProps) {
  const router = useRouter();
  const [title, setTitle]                     = useState(initialData?.title ?? "");
  const [linkedGoalId, setLinkedGoalId]       = useState<string>(initialData?.linkedGoalId ?? "");
  const [linkedMilestoneId, setLinkedMilestoneId] = useState<string>(initialData?.linkedMilestoneId ?? "");
  const [saving, setSaving]                   = useState(false);
  const [error, setError]                     = useState("");
  const [imgUploading, setImgUploading]       = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting]               = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  });

  // ── Image insertion ──
  function triggerImagePicker() {
    fileInputRef.current?.click();
  }

  async function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editor) return;

    // Validate type and size (max 5 MB)
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
      // Convert to base64 data-URL so the image is embedded in the document JSON
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      editor.chain().focus().setImage({ src: dataUrl, alt: file.name }).run();
    } catch {
      setError("Failed to load image. Please try again.");
    } finally {
      setImgUploading(false);
      // Reset the file input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSave() {
    if (!title.trim()) {
      setError("Please enter a title for the document.");
      return;
    }
    setSaving(true);
    setError("");

    const jsonContent = editor?.getJSON();
    const isEditing   = !!initialData?.id;
    const url    = isEditing ? `/api/documents/${initialData!.id}` : "/api/documents";
    const method = isEditing ? "PATCH" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          title: title.trim(),
          content: jsonContent,
          linkedGoalId: linkedGoalId || null,
          linkedMilestoneId: linkedMilestoneId || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save document.");
      } else {
        router.push(`/workspace/${workspaceId}/docs`);
        router.refresh();
      }
    } catch {
      setError("Network error while saving.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initialData?.id) return;
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/documents/${initialData.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to delete document.");
        setShowDeleteConfirm(false);
      } else {
        router.push(`/workspace/${workspaceId}/docs`);
        router.refresh();
      }
    } catch {
      setError("Network error while deleting.");
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  }

  if (!editor) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Top controls */}
      <div className="flex items-center justify-between">
        <Link
          href={`/workspace/${workspaceId}/docs`}
          className="flex items-center gap-1.5 text-sm text-slate hover:text-ink transition-colors"
        >
          <ArrowLeft size={16} /> Back to docs
        </Link>
        <div className="flex items-center gap-2">
          {/* Delete — only shown when editing an existing doc */}
          {initialData?.id && (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleting}
              title="Delete document"
              className="flex items-center gap-1.5 text-sm text-danger hover:bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-blue text-white rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-blue-mid transition-colors disabled:opacity-50 cursor-pointer"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {initialData?.id ? "Save changes" : "Create document"}
          </button>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl border border-border shadow-xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <Trash2 size={16} className="text-danger" />
              </div>
              <h2 className="font-semibold text-ink">Delete document?</h2>
            </div>
            <p className="text-sm text-slate mb-5">
              <strong className="text-ink">{title || "Untitled Document"}</strong> will be permanently deleted along with all its comments. This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 text-sm rounded-xl border border-border text-ink hover:bg-offwhite transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl bg-danger text-white hover:bg-red-600 transition-colors cursor-pointer disabled:opacity-50"
              >
                {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-danger text-sm p-3 rounded-xl">
          {error}
        </div>
      )}

      {/* Document container */}
      <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">

        {/* Entity linking toolbar */}
        <div className="p-4 border-b border-border bg-offwhite flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate">Link to Goal:</span>
            <select
              value={linkedGoalId}
              onChange={(e) => setLinkedGoalId(e.target.value)}
              className="text-xs bg-white border border-border rounded-lg px-2.5 py-1.5 text-ink focus:outline-none focus:ring-1 focus:ring-blue cursor-pointer"
            >
              <option value="">None</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>{g.title}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate">Link to Milestone:</span>
            <select
              value={linkedMilestoneId}
              onChange={(e) => setLinkedMilestoneId(e.target.value)}
              className="text-xs bg-white border border-border rounded-lg px-2.5 py-1.5 text-ink focus:outline-none focus:ring-1 focus:ring-blue cursor-pointer"
            >
              <option value="">None</option>
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>{m.title}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Title */}
        <div className="px-6 pt-6 pb-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled Document"
            className="w-full text-2xl font-bold text-ink placeholder:text-muted focus:outline-none"
          />
        </div>

        {/* Formatting toolbar */}
        <div className="px-6 py-2 border-b border-border flex flex-wrap items-center gap-0.5">
          <ToolbarBtn active={editor.isActive("bold")}        onClick={() => editor.chain().focus().toggleBold().run()}               title="Bold">           <Bold size={15} /></ToolbarBtn>
          <ToolbarBtn active={editor.isActive("italic")}      onClick={() => editor.chain().focus().toggleItalic().run()}             title="Italic">         <Italic size={15} /></ToolbarBtn>
          <ToolbarBtn active={editor.isActive("strike")}      onClick={() => editor.chain().focus().toggleStrike().run()}             title="Strikethrough">  <Strikethrough size={15} /></ToolbarBtn>
          <ToolbarBtn active={editor.isActive("code")}        onClick={() => editor.chain().focus().toggleCode().run()}               title="Inline code">    <Code size={15} /></ToolbarBtn>

          <div className="w-px h-4 bg-border mx-1" />

          <ToolbarBtn active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Heading 1"><Heading1 size={15} /></ToolbarBtn>
          <ToolbarBtn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2"><Heading2 size={15} /></ToolbarBtn>

          <div className="w-px h-4 bg-border mx-1" />

          <ToolbarBtn active={editor.isActive("bulletList")}  onClick={() => editor.chain().focus().toggleBulletList().run()}         title="Bullet list">    <List size={15} /></ToolbarBtn>
          <ToolbarBtn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}        title="Numbered list">  <ListOrdered size={15} /></ToolbarBtn>
          <ToolbarBtn active={editor.isActive("blockquote")}  onClick={() => editor.chain().focus().toggleBlockquote().run()}         title="Quote">          <Quote size={15} /></ToolbarBtn>

          <div className="w-px h-4 bg-border mx-1" />

          {/* Image insert button */}
          <ToolbarBtn
            active={false}
            onClick={triggerImagePicker}
            title="Insert image from device"
            loading={imgUploading}
          >
            {imgUploading ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
          </ToolbarBtn>

          <div className="w-px h-4 bg-border mx-1" />

          {/* Import doc button */}
          <ImportDocButton workspaceId={workspaceId} variant="toolbar" />
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
            💡 Click <ImagePlus size={10} className="inline" /> to insert an image from your device (max 5 MB). Images are embedded in the document.
          </p>
          <p className="text-[11px] text-muted">
            📄 Click <Upload size={10} className="inline" /> to import a <strong>.txt</strong>, <strong>.md</strong>, or <strong>.docx</strong> file and open it as a new document.
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
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={loading}
      className={`p-1.5 rounded-md text-slate hover:text-ink hover:bg-offwhite transition-colors cursor-pointer disabled:opacity-50 ${
        active ? "bg-blue-faint text-blue" : ""
      }`}
    >
      {children}
    </button>
  );
}
