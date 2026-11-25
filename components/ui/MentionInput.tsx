"use client";

import React, { useState, useEffect, useRef, useId, useCallback } from "react";
import Image from "next/image";
import { AtSign, AlertCircle, RefreshCw } from "lucide-react";

export interface WorkspaceMemberMention {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
  handle: string;
}

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  workspaceId: string;
  className?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}

const ROLE_BADGE: Record<string, string> = {
  admin: "bg-purple-50 text-purple-700 border border-purple-200",
  pm: "bg-blue-50 text-blue-700 border border-blue-200",
  eng: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  marketing: "bg-amber-50 text-amber-700 border border-amber-200",
  exec: "bg-rose-50 text-rose-700 border border-rose-200",
};

export function MentionInput({
  value,
  onChange,
  onSubmit,
  placeholder = "Add a comment… (Type @ to mention someone)",
  workspaceId,
  className = "",
  autoFocus = false,
  disabled = false,
}: MentionInputProps) {
  const [members, setMembers] = useState<WorkspaceMemberMention[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mentionStartIndex, setMentionStartIndex] = useState<number>(-1);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLDivElement | null>>([]);

  // Fetch workspace members
  const loadMembers = useCallback(async () => {
    if (!workspaceId) return;
    setIsLoadingMembers(true);
    setMembersError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/members`);
      if (!res.ok) {
        setMembersError("Could not load team members.");
        return;
      }
      const data = await res.json();
      setMembers(data.members ?? []);
    } catch (err) {
      console.error("[MentionInput] Failed to load members for mentions:", err);
      setMembersError("Network error loading team members.");
    } finally {
      setIsLoadingMembers(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  // Filter members by query
  const filteredMembers = members.filter((m) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      m.handle.toLowerCase().includes(q) ||
      (m.name && m.name.toLowerCase().includes(q)) ||
      m.email.toLowerCase().includes(q)
    );
  });

  const safeSelectedIndex =
    filteredMembers.length === 0 ? 0 : Math.min(selectedIndex, filteredMembers.length - 1);

  const activeOptionId =
    isOpen && filteredMembers.length > 0
      ? `${listboxId}-option-${safeSelectedIndex}`
      : undefined;

  // Scroll the highlighted option into view
  useEffect(() => {
    if (!isOpen) return;
    optionRefs.current[safeSelectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [isOpen, safeSelectedIndex]);

  // Check if cursor is right after @ trigger on input changes or selection
  function evaluateMentionTrigger(text: string, cursorPos: number) {
    const textBeforeCursor = text.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf("@");

    if (atIndex !== -1) {
      const charBeforeAt = atIndex > 0 ? textBeforeCursor[atIndex - 1] : " ";
      const isStartOrWhitespace = /\s|[(\[{<,:]/.test(charBeforeAt) || atIndex === 0;

      if (isStartOrWhitespace) {
        const textAfterAt = textBeforeCursor.slice(atIndex + 1);
        // Only trigger if no spaces after @
        if (!/\s/.test(textAfterAt) && /^[a-zA-Z0-9._-]*$/.test(textAfterAt)) {
          setMentionStartIndex(atIndex);
          setSearchQuery(textAfterAt);
          setIsOpen(true);
          setSelectedIndex(0);
          return;
        }
      }
    }

    setIsOpen(false);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart ?? newValue.length;
    onChange(newValue);
    evaluateMentionTrigger(newValue, cursorPos);
  }

  function handleInputClick(e: React.MouseEvent<HTMLInputElement>) {
    const target = e.currentTarget;
    const cursorPos = target.selectionStart ?? value.length;
    evaluateMentionTrigger(value, cursorPos);
  }

  function insertMention(member: WorkspaceMemberMention) {
    if (!inputRef.current || mentionStartIndex === -1) return;

    const beforeMention = value.slice(0, mentionStartIndex);
    const textBeforeCursor = value.slice(0, inputRef.current.selectionStart ?? value.length);
    const afterCursor = value.slice(textBeforeCursor.length);

    // Format handle nicely without spaces
    const handleToInsert = `@${member.handle} `;
    const updatedValue = `${beforeMention}${handleToInsert}${afterCursor}`;

    onChange(updatedValue);
    setIsOpen(false);

    // Reset cursor position after the inserted handle
    const newCursorPos = beforeMention.length + handleToInsert.length;
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) {
      return;
    }

    if (isOpen) {
      if (e.key === "Escape") {
        e.preventDefault();
        setIsOpen(false);
        return;
      }
      if (filteredMembers.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % filteredMembers.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + filteredMembers.length) % filteredMembers.length);
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          const chosen = filteredMembers[safeSelectedIndex];
          if (chosen) {
            insertMention(chosen);
          }
          return;
        }
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit?.();
    }
  }

  // Close popup if clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative flex-1">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-activedescendant={activeOptionId}
        value={value}
        onChange={handleInputChange}
        onClick={handleInputClick}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        className={
          className ||
          "w-full border border-border rounded-xl px-3 py-2 text-sm text-ink placeholder:text-slate/60 focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-all bg-white"
        }
      />

      {/* Floating Mention Autocomplete Popover */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute bottom-full mb-2 left-0 w-80 max-w-[calc(100vw-2rem)] max-h-64 bg-white rounded-2xl border border-border shadow-2xl p-1.5 z-50 overflow-y-auto animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-2.5 py-1.5 border-b border-border/60 flex items-center justify-between text-[11px] font-bold text-slate">
            <span className="flex items-center gap-1.5">
              <AtSign size={12} className="text-blue" aria-hidden="true" /> Mention team member
            </span>
            <span className="text-[11px] text-slate font-mono">
              {isLoadingMembers ? "Loading…" : `${filteredMembers.length} available`}
            </span>
          </div>

          <div id={listboxId} role="listbox" aria-label="Team members" className="py-1">
            {isLoadingMembers ? (
              <div className="px-3 py-4 text-center text-xs text-slate" role="status">
                Loading team members…
              </div>
            ) : membersError ? (
              <div className="px-3 py-3 text-center space-y-2" role="alert">
                <p className="text-xs text-rose-700 flex items-center justify-center gap-1.5">
                  <AlertCircle size={13} aria-hidden="true" />
                  {membersError}
                </p>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void loadMembers()}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-offwhite border border-border text-xs font-semibold text-ink hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <RefreshCw size={11} aria-hidden="true" />
                  Retry
                </button>
              </div>
            ) : filteredMembers.length > 0 ? (
              filteredMembers.map((m, idx) => {
                const isSelected = idx === safeSelectedIndex;
                const roleBadgeClass = ROLE_BADGE[m.role] || "bg-slate-100 text-slate-600";

                return (
                  <div
                    key={m.id}
                    ref={(el) => {
                      optionRefs.current[idx] = el;
                    }}
                    id={`${listboxId}-option-${idx}`}
                    role="option"
                    aria-selected={isSelected}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => insertMention(m)}
                    className={`flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-xs cursor-pointer transition-all ${
                      isSelected
                        ? "bg-blue-faint text-blue border border-blue-light/70"
                        : "hover:bg-offwhite text-ink border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Avatar */}
                      {m.image ? (
                        <Image
                          src={m.image}
                          alt={m.name || m.email}
                          width={24}
                          height={24}
                          unoptimized
                          className="w-6 h-6 rounded-full object-cover border border-border shrink-0"
                        />
                      ) : (
                        <div
                          aria-hidden="true"
                          className="w-6 h-6 rounded-full bg-blue-light flex items-center justify-center text-blue text-[11px] font-bold uppercase shrink-0"
                        >
                          {m.name ? m.name[0] : m.email[0]}
                        </div>
                      )}
                      {/* Name & Handle */}
                      <div className="min-w-0">
                        <div className="font-semibold text-ink truncate leading-tight">
                          {m.name || m.email.split("@")[0]}
                        </div>
                        <div className="text-[11px] text-slate truncate font-mono">
                          @{m.handle}
                        </div>
                      </div>
                    </div>

                    {/* Role Pill */}
                    <span className={`text-[11px] uppercase font-bold px-1.5 py-0.5 rounded-md shrink-0 ${roleBadgeClass}`}>
                      {m.role}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="px-3 py-4 text-center text-xs text-slate">
                No team member matching <span className="font-mono text-ink font-semibold">@{searchQuery}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Helper to render comment bodies with styled @mention badge pills
 */
export function renderMentionedBody(body: string) {
  if (!body) return null;

  // Split by @handle matches to highlight mentions
  const parts = body.split(/((?:^|[\s(])@[a-zA-Z0-9][a-zA-Z0-9._-]*)/g);

  return parts.map((part, i) => {
    const trimmed = part.trim();
    if (trimmed.startsWith("@")) {
      return (
        <span
          key={i}
          className="inline-flex items-center font-semibold text-blue bg-blue-faint border border-blue-light/60 px-1.5 py-0.5 rounded-md mx-0.5 font-mono text-[13px]"
        >
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
