"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import LinkExtension from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bold, Italic, Strikethrough, Code, Heading1, Heading2,
  List, ListOrdered, Quote, Save, ArrowLeft, Loader2
} from "lucide-react";
import Link from "next/link";

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
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [linkedGoalId, setLinkedGoalId] = useState<string>(initialData?.linkedGoalId ?? "");
  const [linkedMilestoneId, setLinkedMilestoneId] = useState<string>(initialData?.linkedMilestoneId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const editor = useEditor({
    extensions: [
      StarterKit,
      LinkExtension.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "Start writing your document..." }),
    ],
    content: (initialData?.content as JSON) ?? "",
    editorProps: {
      attributes: {
        class: "prose max-w-none focus:outline-none min-h-[300px] text-ink text-sm leading-relaxed p-4",
      },
    },
  });

  async function handleSave() {
    if (!title.trim()) {
      setError("Please enter a title for the document.");
      return;
    }
    setSaving(true);
    setError("");

    const jsonContent = editor?.getJSON();

    const isEditing = !!initialData?.id;
    const url = isEditing ? `/api/documents/${initialData.id}` : "/api/documents";
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

  if (!editor) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Top Header Controls */}
      <div className="flex items-center justify-between">
        <Link
          href={`/workspace/${workspaceId}/docs`}
          className="flex items-center gap-1.5 text-sm text-slate hover:text-ink transition-colors"
        >
          <ArrowLeft size={16} /> Back to docs
        </Link>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-blue text-white rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-blue-mid transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {initialData?.id ? "Save changes" : "Create document"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-danger text-sm p-3 rounded-xl">
          {error}
        </div>
      )}

      {/* Document Form Container */}
      <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
        {/* Entity Linking Options */}
        <div className="p-4 border-b border-border bg-offwhite flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate">Link to Goal:</span>
            <select
              value={linkedGoalId}
              onChange={(e) => setLinkedGoalId(e.target.value)}
              className="text-xs bg-white border border-border rounded-lg px-2.5 py-1.5 text-ink focus:outline-none focus:ring-1 focus:ring-blue"
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
              className="text-xs bg-white border border-border rounded-lg px-2.5 py-1.5 text-ink focus:outline-none focus:ring-1 focus:ring-blue"
            >
              <option value="">None</option>
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>{m.title}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Title Input */}
        <div className="px-6 pt-6 pb-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled Document"
            className="w-full text-2xl font-bold text-ink placeholder:text-muted focus:outline-none"
          />
        </div>

        {/* Editor Formatting Toolbar */}
        <div className="px-6 py-2 border-b border-border flex flex-wrap items-center gap-1">
          <ToolbarBtn
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Bold"
          >
            <Bold size={15} />
          </ToolbarBtn>

          <ToolbarBtn
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Italic"
          >
            <Italic size={15} />
          </ToolbarBtn>

          <ToolbarBtn
            active={editor.isActive("strike")}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            title="Strikethrough"
          >
            <Strikethrough size={15} />
          </ToolbarBtn>

          <ToolbarBtn
            active={editor.isActive("code")}
            onClick={() => editor.chain().focus().toggleCode().run()}
            title="Code"
          >
            <Code size={15} />
          </ToolbarBtn>

          <div className="w-px h-4 bg-border mx-1" />

          <ToolbarBtn
            active={editor.isActive("heading", { level: 1 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            title="Heading 1"
          >
            <Heading1 size={15} />
          </ToolbarBtn>

          <ToolbarBtn
            active={editor.isActive("heading", { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title="Heading 2"
          >
            <Heading2 size={15} />
          </ToolbarBtn>

          <div className="w-px h-4 bg-border mx-1" />

          <ToolbarBtn
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Bullet List"
          >
            <List size={15} />
          </ToolbarBtn>

          <ToolbarBtn
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Numbered List"
          >
            <ListOrdered size={15} />
          </ToolbarBtn>

          <ToolbarBtn
            active={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            title="Quote"
          >
            <Quote size={15} />
          </ToolbarBtn>
        </div>

        {/* Content Area */}
        <div className="px-2 py-4">
          <EditorContent editor={editor} />
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
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-md text-slate hover:text-ink hover:bg-offwhite transition-colors ${
        active ? "bg-blue-faint text-blue font-bold" : ""
      }`}
    >
      {children}
    </button>
  );
}
