"use client";

import React, { useState } from "react";
import { CitationBadge } from "./CitationBadge";
import { Check, Copy } from "lucide-react";

interface MarkdownContentProps {
  content: string;
  workspaceId?: string;
  className?: string;
}

/**
 * Parses inline formatting:
 * - [[cite:entityType:entityId:Title]] -> <CitationBadge />
 * - **bold** -> <strong>
 * - *italic* / _italic_ -> <em>
 * - `code` -> <code>
 * - [link](url) -> <a>
 */
function parseInline(text: string, workspaceId?: string): React.ReactNode[] {
  // Regex tokenizes citations, code, bold, italic, and links
  const tokenRegex =
    /(\[\[cite:(document|goal|milestone|task|comment):([^:]+):([^\]]+)\]\])|(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*]+\*)|(_[^_]+_)|(\[[^\]]+\]\([^)]+\))/g;

  const elements: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    const start = match.index;
    if (start > lastIdx) {
      elements.push(text.slice(lastIdx, start));
    }

    const fullMatch = match[0];

    // 1. Citation: [[cite:type:id:title]]
    if (match[1]) {
      const entityType = match[2];
      const entityId = match[3];
      const title = match[4];
      elements.push(
        <CitationBadge
          key={`cite-${entityId}-${start}`}
          entityType={entityType}
          entityId={entityId}
          title={title}
          workspaceId={workspaceId}
        />
      );
    }
    // 2. Inline Code: `code`
    else if (fullMatch.startsWith("`") && fullMatch.endsWith("`")) {
      const code = fullMatch.slice(1, -1);
      elements.push(
        <code
          key={`code-${start}`}
          className="px-1 py-0.5 bg-slate-100 border border-slate-200/80 text-blue-700 font-mono text-[11px] rounded"
        >
          {code}
        </code>
      );
    }
    // 3. Bold: **bold** or __bold__
    else if (
      (fullMatch.startsWith("**") && fullMatch.endsWith("**")) ||
      (fullMatch.startsWith("__") && fullMatch.endsWith("__"))
    ) {
      const inner = fullMatch.slice(2, -2);
      elements.push(
        <strong key={`bold-${start}`} className="font-semibold text-ink">
          {parseInline(inner, workspaceId)}
        </strong>
      );
    }
    // 4. Italic: *italic* or _italic_
    else if (
      (fullMatch.startsWith("*") && fullMatch.endsWith("*")) ||
      (fullMatch.startsWith("_") && fullMatch.endsWith("_"))
    ) {
      const inner = fullMatch.slice(1, -1);
      elements.push(
        <em key={`italic-${start}`} className="italic text-slate-700">
          {parseInline(inner, workspaceId)}
        </em>
      );
    }
    // 5. Markdown Link: [title](url)
    else if (fullMatch.startsWith("[") && fullMatch.includes("](")) {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(fullMatch);
      if (linkMatch) {
        elements.push(
          <a
            key={`link-${start}`}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue font-medium hover:underline"
          >
            {linkMatch[1]}
          </a>
        );
      } else {
        elements.push(fullMatch);
      }
    } else {
      elements.push(fullMatch);
    }

    lastIdx = start + fullMatch.length;
  }

  if (lastIdx < text.length) {
    elements.push(text.slice(lastIdx));
  }

  return elements;
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2.5 rounded-xl border border-slate-700 bg-slate-900 text-slate-100 overflow-hidden shadow-xs">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800/80 border-b border-slate-700 text-[11px] text-slate-400">
        <span className="font-mono">{lang || "text"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <Check size={12} className="text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3 font-mono text-[11px] overflow-x-auto leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/**
 * Preprocesses raw AI text to guarantee proper newlines before headings and bullet points,
 * even when the LLM outputs single-line or compressed markdown.
 */
function preprocessMarkdown(raw: string): string {
  if (!raw) return "";

  let text = raw;

  // 1. Separate headings that are joined to preceding text: e.g. "paragraph. ### Heading" -> "paragraph.\n\n### Heading"
  text = text.replace(/([^\n])\s*(#{1,4}\s+)/g, "$1\n\n$2");

  // 2. Separate headings that are joined to following text on the same line:
  // e.g. "### Title Based on the" -> "### Title\n\nBased on the"
  text = text.replace(
    /^(#{1,4}\s+[A-Z0-9][A-Za-z0-9\s/&—–\-]+?)(?=\s+(?:Based on|According to|Here are|To confirm|In this|We have|Currently|Please|[A-Z][a-z]+(?:\s+[a-z]+){2,}))/gm,
    "$1\n\n"
  );

  // 3. Separate inline bullet points: e.g. "following: * Item 1 * Item 2" -> "following:\n* Item 1\n* Item 2"
  text = text.replace(/([^\n])\s+([*•\-]\s+)/g, "$1\n$2");

  return text;
}

/**
 * Rich Text Markdown renderer with full support for citations, headings,
 * bold/italics, bullet/ordered lists, blockquotes, and code blocks.
 */
export function MarkdownContent({
  content,
  workspaceId,
  className = "",
}: MarkdownContentProps) {
  if (!content) return null;

  // Preprocess markdown to fix compressed headings and bullet lists
  const cleanedContent = preprocessMarkdown(content);

  // Split into lines to parse block-level structures
  const lines = cleanedContent.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];

  let i = 0;
  let inCodeBlock = false;
  let codeBlockLang = "";
  let codeBlockLines: string[] = [];

  let currentListType: "ul" | "ol" | null = null;
  let currentListItems: React.ReactNode[] = [];

  function flushList() {
    if (currentListType && currentListItems.length > 0) {
      if (currentListType === "ul") {
        blocks.push(
          <ul
            key={`ul-${blocks.length}`}
            className="my-1.5 pl-4 space-y-1 list-disc list-outside text-slate-800 marker:text-blue"
          >
            {currentListItems}
          </ul>
        );
      } else {
        blocks.push(
          <ol
            key={`ol-${blocks.length}`}
            className="my-1.5 pl-4 space-y-1 list-decimal list-outside text-slate-800 marker:font-semibold marker:text-slate-600"
          >
            {currentListItems}
          </ol>
        );
      }
      currentListType = null;
      currentListItems = [];
    }
  }

  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // 1. Code Block start/end ```
    if (trimmed.startsWith("```")) {
      flushList();
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = trimmed.slice(3).trim();
        codeBlockLines = [];
      } else {
        inCodeBlock = false;
        blocks.push(
          <CodeBlock
            key={`code-block-${blocks.length}`}
            code={codeBlockLines.join("\n")}
            lang={codeBlockLang}
          />
        );
        codeBlockLines = [];
        codeBlockLang = "";
      }
      i++;
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(rawLine);
      i++;
      continue;
    }

    // 2. Empty line
    if (!trimmed) {
      flushList();
      i++;
      continue;
    }

    // 3. Horizontal Rule
    if (/^(\*\*\*|---|___)$/.test(trimmed)) {
      flushList();
      blocks.push(<hr key={`hr-${blocks.length}`} className="my-2 border-border/80" />);
      i++;
      continue;
    }

    // 4. Headings
    if (trimmed.startsWith("# ")) {
      flushList();
      blocks.push(
        <h1
          key={`h1-${blocks.length}`}
          className="text-sm font-bold text-ink mt-3 mb-1.5 pb-1 border-b border-border/60"
        >
          {parseInline(trimmed.slice(2), workspaceId)}
        </h1>
      );
      i++;
      continue;
    }

    if (trimmed.startsWith("## ")) {
      flushList();
      blocks.push(
        <h2
          key={`h2-${blocks.length}`}
          className="text-xs font-bold text-ink mt-2.5 mb-1 uppercase tracking-wide flex items-center gap-1.5"
        >
          {parseInline(trimmed.slice(3), workspaceId)}
        </h2>
      );
      i++;
      continue;
    }

    if (trimmed.startsWith("### ")) {
      flushList();
      blocks.push(
        <h3
          key={`h3-${blocks.length}`}
          className="text-xs font-bold text-slate-800 mt-2 mb-1"
        >
          {parseInline(trimmed.slice(4), workspaceId)}
        </h3>
      );
      i++;
      continue;
    }

    if (trimmed.startsWith("#### ")) {
      flushList();
      blocks.push(
        <h4
          key={`h4-${blocks.length}`}
          className="text-xs font-semibold text-slate-700 mt-1.5 mb-0.5"
        >
          {parseInline(trimmed.slice(5), workspaceId)}
        </h4>
      );
      i++;
      continue;
    }

    // 5. Blockquote
    if (trimmed.startsWith("> ")) {
      flushList();
      blocks.push(
        <blockquote
          key={`quote-${blocks.length}`}
          className="border-l-2 border-blue-500 pl-3 py-1 my-1.5 text-slate-600 bg-blue-50/40 rounded-r-md text-xs italic leading-relaxed"
        >
          {parseInline(trimmed.slice(2), workspaceId)}
        </blockquote>
      );
      i++;
      continue;
    }

    // 6. Unordered List Items: `* `, `- `, `• `
    const ulMatch = /^([*\-•])\s+(.+)$/.exec(trimmed);
    if (ulMatch) {
      if (currentListType !== "ul") {
        flushList();
        currentListType = "ul";
      }
      currentListItems.push(
        <li key={`li-${currentListItems.length}`} className="text-xs leading-relaxed">
          {parseInline(ulMatch[2], workspaceId)}
        </li>
      );
      i++;
      continue;
    }

    // 7. Ordered List Items: `1. `, `2. `
    const olMatch = /^(\d+)\.\s+(.+)$/.exec(trimmed);
    if (olMatch) {
      if (currentListType !== "ol") {
        flushList();
        currentListType = "ol";
      }
      currentListItems.push(
        <li key={`oli-${currentListItems.length}`} className="text-xs leading-relaxed">
          {parseInline(olMatch[2], workspaceId)}
        </li>
      );
      i++;
      continue;
    }

    // 8. Regular paragraph text (can also contain inline citations, bold, etc.)
    flushList();
    blocks.push(
      <p key={`p-${blocks.length}`} className="my-1.5 text-xs text-ink leading-relaxed">
        {parseInline(trimmed, workspaceId)}
      </p>
    );

    i++;
  }

  flushList();

  if (inCodeBlock && codeBlockLines.length > 0) {
    blocks.push(
      <CodeBlock
        key={`code-block-${blocks.length}`}
        code={codeBlockLines.join("\n")}
        lang={codeBlockLang}
      />
    );
  }

  return <div className={`space-y-1 ${className}`}>{blocks}</div>;
}
