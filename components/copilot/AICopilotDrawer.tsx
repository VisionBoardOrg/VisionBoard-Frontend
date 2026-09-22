"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Sparkles,
  X,
  Send,
  Loader2,
  Bot,
  User as UserIcon,
  RefreshCw,
  FileText,
  Copy,
  Check,
  Zap,
  TrendingUp,
  ListTodo,
  Database,
  ThumbsUp,
  ThumbsDown,
  Layers,
  FileCheck,
  Rocket,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { CitationBadge } from "./CitationBadge";
import { MarkdownContent } from "./MarkdownContent";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface AICopilotDrawerProps {
  workspaceId: string;
  plan?: string | null;
  aiCreditsUsed?: number;
  aiCreditsMax?: number;
  isOpen?: boolean;
  onClose?: () => void;
  onOpen?: () => void;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Array<{
    id?: string;
    entityType: string;
    entityId: string;
    title: string;
    snippet?: string;
    url?: string;
  }>;
  createdAt?: string;
}

interface IndexStats {
  documentsCount: number;
  goalsCount: number;
  milestonesCount: number;
  tasksCount: number;
  totalChunks: number;
  lastIndexedAt: string | null;
}

type CopilotTab = "chat" | "executive" | "standup" | "knowledge" | "roadmap";

interface GoalOption {
  id: string;
  title: string;
}

interface RoadmapMilestone {
  title: string;
  description: string;
  targetDate: string;
  suggestedTasks?: string[];
  tasks?: unknown[];
  suggested_tasks?: unknown[];
  dependsOn?: number[];
}

export function AICopilotDrawer({
  workspaceId,
  plan = "free",
  aiCreditsUsed = 0,
  aiCreditsMax = 10,
  isOpen: externalIsOpen,
  onClose: externalOnClose,
  onOpen: externalOnOpen,
}: AICopilotDrawerProps) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = externalIsOpen !== undefined;
  const isOpen = isControlled ? externalIsOpen : internalOpen;

  const handleOpen = useCallback(() => {
    if (isControlled) {
      externalOnOpen?.();
    } else {
      setInternalOpen(true);
    }
  }, [isControlled, externalOnOpen]);

  const handleClose = useCallback(() => {
    if (isControlled) {
      externalOnClose?.();
    } else {
      setInternalOpen(false);
    }
  }, [isControlled, externalOnClose]);

  const toggleOpen = useCallback(() => {
    if (isOpen) {
      handleClose();
    } else {
      handleOpen();
    }
  }, [isOpen, handleClose, handleOpen]);

  const [activeTab, setActiveTab] = useState<CopilotTab>("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Executive Summary State
  const [execSummary, setExecSummary] = useState<string>("");
  const [execLoading, setExecLoading] = useState(false);
  const [execSavedDocId, setExecSavedDocId] = useState<string | null>(null);
  const [savingDoc, setSavingDoc] = useState(false);

  // Standup State
  const [standupText, setStandupText] = useState<string>("");
  const [standupLoading, setStandupLoading] = useState(false);

  // Knowledge Index Stats
  const [indexStats, setIndexStats] = useState<IndexStats | null>(null);
  const [isSyncingKnowledge, setIsSyncingKnowledge] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);

  // Roadmap Generator State
  const [roadmapInput, setRoadmapInput] = useState("");
  const [roadmapLoading, setRoadmapLoading] = useState(false);
  const [roadmapError, setRoadmapError] = useState("");
  const [roadmapResult, setRoadmapResult] = useState<{
    goalTitle?: string;
    goalObjective?: string;
    milestones: RoadmapMilestone[];
    generationId: string;
  } | null>(null);
  const [roadmapCommitGoalId, setRoadmapCommitGoalId] = useState<string | null>(null);
  const [roadmapCommitLoading, setRoadmapCommitLoading] = useState(false);
  const [roadmapAppliedGoal, setRoadmapAppliedGoal] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [workspaceGoals, setWorkspaceGoals] = useState<GoalOption[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(false);

  // Credits
  const [creditsUsed, setCreditsUsed] = useState(aiCreditsUsed);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Keyboard shortcut listener (Ctrl+J or Cmd+J)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        toggleOpen();
      }
      if (e.key === "Escape" && isOpen) {
        handleClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, toggleOpen, handleClose]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && activeTab === "chat") {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, activeTab]);

  // Scroll to bottom on new message
  useEffect(() => {
    if (activeTab === "chat") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, activeTab]);

  // Fetch index stats when drawer opens or knowledge tab is clicked
  const fetchIndexStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/ai/copilot/index?workspaceId=${workspaceId}`);
      if (res.ok) {
        const data = await res.json();
        setIndexStats(data.stats);
      }
    } catch {}
  }, [workspaceId]);

  useEffect(() => {
    if (isOpen) {
      fetchIndexStats();
    }
  }, [isOpen, fetchIndexStats]);

  // Re-index Workspace Knowledge
  const handleSyncKnowledge = async () => {
    setIsSyncingKnowledge(true);
    setSyncSuccess(false);
    try {
      const res = await fetch("/api/ai/copilot/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      if (res.ok) {
        const data = await res.json();
        setIndexStats(data.stats);
        setSyncSuccess(true);
        setTimeout(() => setSyncSuccess(false), 3500);
      }
    } catch {
    } finally {
      setIsSyncingKnowledge(false);
    }
  };

  // Submit chat message
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputValue).trim();
    if (!text || isStreaming) return;

    setInputValue("");
    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `asst-${Date.now()}`;

    // Append user message and placeholder assistant message
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", content: text },
      { id: assistantMsgId, role: "assistant", content: "", citations: [] },
    ]);

    setIsStreaming(true);

    try {
      const res = await fetch("/api/ai/copilot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          message: text,
          conversationId,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: `⚠️ ${errJson.error || "Failed to reach AI Copilot. Please try again."}` }
              : m
          )
        );
        setIsStreaming(false);
        return;
      }

      // Read SSE stream
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body stream.");

      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let accumulatedText = "";
      let activeCitations: Array<{
        id?: string;
        entityType: string;
        entityId: string;
        title: string;
        snippet?: string;
        url?: string;
      }> = [];

      setCreditsUsed((c) => c + 1);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "start") {
                if (data.conversationId) setConversationId(data.conversationId);
                if (data.citations) {
                  activeCitations = data.citations;
                  setMessages((prev) =>
                    prev.map((m) => (m.id === assistantMsgId ? { ...m, citations: activeCitations } : m))
                  );
                }
              } else if (data.type === "chunk") {
                accumulatedText += data.text;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, content: accumulatedText, citations: activeCitations }
                      : m
                  )
                );
              } else if (data.type === "done") {
                if (data.conversationId) setConversationId(data.conversationId);
              } else if (data.type === "error") {
                accumulatedText += `\n\n⚠️ ${data.error}`;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, content: accumulatedText }
                      : m
                  )
                );
              }
            } catch {}
          }
        }
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: "⚠️ Network connection interrupted. Please try again." }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  };

  // Generate Executive Summary
  const handleGenerateExecutiveSummary = async () => {
    setExecLoading(true);
    setExecSavedDocId(null);
    try {
      const res = await fetch("/api/ai/copilot/executive-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      if (res.ok) {
        const data = await res.json();
        setExecSummary(data.summary);
        setCreditsUsed((c) => c + 1);
      }
    } catch {
    } finally {
      setExecLoading(false);
    }
  };

  // Save Executive Summary to Docs
  const handleSaveExecToDoc = async () => {
    if (!execSummary || savingDoc) return;
    setSavingDoc(true);
    try {
      const res = await fetch("/api/ai/copilot/executive-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, saveAsDoc: true }),
      });
      if (res.ok) {
        const data = await res.json();
        setExecSavedDocId(data.createdDocId);
      }
    } catch {
    } finally {
      setSavingDoc(false);
    }
  };

  // Generate Standup
  const handleGenerateStandup = async () => {
    setStandupLoading(true);
    try {
      const res = await fetch("/api/ai/copilot/standup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      if (res.ok) {
        const data = await res.json();
        setStandupText(data.standup);
        setCreditsUsed((c) => c + 1);
      }
    } catch {
    } finally {
      setStandupLoading(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ── Roadmap Generator Handlers ──

  const fetchWorkspaceGoals = useCallback(async () => {
    setGoalsLoading(true);
    try {
      const res = await fetch(`/api/goals?workspaceId=${workspaceId}`);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.goals ?? [];
        setWorkspaceGoals(
          list
            .filter((g: { id?: string; title?: string }) => g.id && g.title)
            .map((g: { id: string; title: string }) => ({ id: g.id, title: g.title }))
        );
      }
    } catch {
    } finally {
      setGoalsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (isOpen && activeTab === "roadmap") {
      fetchWorkspaceGoals();
    }
  }, [isOpen, activeTab, fetchWorkspaceGoals]);

  const handleGenerateRoadmap = async () => {
    const description = roadmapInput.trim();
    if (!description || roadmapLoading) return;

    setRoadmapLoading(true);
    setRoadmapError("");
    setRoadmapAppliedGoal(null);
    setRoadmapResult(null);

    try {
      const res = await fetch("/api/ai/roadmap-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, text: description }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRoadmapError(data.error ?? "Failed to generate roadmap.");
      } else {
        setRoadmapResult({
          goalTitle: data.goalTitle,
          goalObjective: data.goalObjective,
          milestones: data.milestones ?? [],
          generationId: data.generationId,
        });
        setCreditsUsed((c) => c + 1);
      }
    } catch {
      setRoadmapError("Network error while generating roadmap.");
    } finally {
      setRoadmapLoading(false);
    }
  };

  const handleCommitRoadmap = async (opts?: { resume?: boolean }) => {
    if (!roadmapResult || roadmapCommitLoading) return;
    setRoadmapCommitLoading(true);
    setRoadmapError("");
    const resume = Boolean(opts?.resume);
    try {
      const payload: Record<string, unknown> = {
        generationId: roadmapResult.generationId,
        milestones: roadmapResult.milestones,
      };
      if (resume) {
        payload.resume = true;
      } else if (roadmapCommitGoalId && roadmapCommitGoalId !== "new") {
        payload.goalId = roadmapCommitGoalId;
      } else {
        payload.newGoal = {
          title: roadmapResult.goalTitle ?? "New Roadmap Goal",
          objective: roadmapResult.goalObjective,
          status: "active",
        };
      }

      const res = await fetch("/api/ai/roadmap-generator/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.resumable && !resume) {
          setRoadmapError(
            data.error +
              ` (${data.appliedCount ?? 0}/${data.totalMilestones} milestones applied). You can resume to add the remaining ones.`
          );
          if (data.existingGoalId) setRoadmapCommitGoalId(data.existingGoalId);
        } else if (res.status === 409 && data.skippedAll) {
          setRoadmapError(data.error);
          if (data.goal) {
            setRoadmapAppliedGoal({ id: data.goal.id, title: data.goal.title });
          }
        } else {
          setRoadmapError(data.error ?? "Failed to apply roadmap to board.");
        }
      } else {
        setRoadmapAppliedGoal({
          id: data.goal.id,
          title: data.goal.title,
        });
        if (data.resumed) {
          router.refresh();
        } else {
          router.refresh();
        }
      }
    } catch {
      setRoadmapError("Network error while applying roadmap.");
    } finally {
      setRoadmapCommitLoading(false);
    }
  };

  const QUICK_PROMPTS = [
    "What are our most critical open blockers?",
    "Summarize all active OKRs & goals",
    "Draft a PRD based on workspace docs",
    "Which milestones are at risk of delay?",
  ];

  return (
    <>
      {/* ── Floating Launcher Button ── */}
      {!isOpen && (
        <button
          onClick={handleOpen}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-full shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer group"
          title="Open AI Copilot (Ctrl+J or ⌘J)"
        >
          <div className="relative">
            <Sparkles size={18} className="animate-pulse" />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-400 rounded-full ring-2 ring-blue-600" />
          </div>
          <span className="text-xs font-semibold tracking-wide">AI Copilot</span>
          <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded font-mono hidden sm:inline">
            ⌘J
          </span>
        </button>
      )}

      {/* ── Backdrop for mobile ── */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-xs md:hidden"
          onClick={handleClose}
        />
      )}

      {/* ── Slide-Over Drawer ── */}
      <div
        className={`fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[460px] md:w-[500px] bg-white border-l border-border shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* ── Header ── */}
        <div className="p-4 border-b border-border bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue to-indigo-600 flex items-center justify-center text-white shadow-sm shadow-blue/30">
              <Bot size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-ink">VisionBoard Copilot</h2>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-blue-100 text-blue">
                  RAG Active
                </span>
              </div>
              <p className="text-[11px] text-slate">
                Semantic multi-document workspace intelligence
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-ink hover:bg-black/5 transition-colors cursor-pointer"
              title="Close Copilot (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Context & Navigation Sub-header ── */}
        <div className="px-4 py-2 bg-offwhite border-b border-border/80 flex items-center justify-between text-xs shrink-0">
          {/* Tabs */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab("chat")}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === "chat"
                  ? "bg-blue text-white shadow-xs"
                  : "text-slate hover:text-ink hover:bg-slate-200/60"
              }`}
            >
              <Bot size={13} /> Chat
            </button>
            <button
              onClick={() => setActiveTab("executive")}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === "executive"
                  ? "bg-blue text-white shadow-xs"
                  : "text-slate hover:text-ink hover:bg-slate-200/60"
              }`}
            >
              <TrendingUp size={13} /> Executive
            </button>
            <button
              onClick={() => setActiveTab("standup")}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === "standup"
                  ? "bg-blue text-white shadow-xs"
                  : "text-slate hover:text-ink hover:bg-slate-200/60"
              }`}
            >
              <ListTodo size={13} /> Standup
            </button>
            <button
              onClick={() => setActiveTab("knowledge")}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === "knowledge"
                  ? "bg-blue text-white shadow-xs"
                  : "text-slate hover:text-ink hover:bg-slate-200/60"
              }`}
            >
              <Database size={13} /> Sync
            </button>
            <button
              onClick={() => setActiveTab("roadmap")}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === "roadmap"
                  ? "bg-blue text-white shadow-xs"
                  : "text-slate hover:text-ink hover:bg-slate-200/60"
              }`}
            >
              <Rocket size={13} /> Roadmap
            </button>
          </div>

          {/* Credits Counter */}
          <div className="flex items-center gap-1 text-[11px] text-slate-500 font-medium">
            <Zap size={11} className="text-amber-500" />
            <span>
              {aiCreditsMax < 0 ? "Unlimited" : `${creditsUsed}/${aiCreditsMax}`}
            </span>
          </div>
        </div>

        {/* ── Tab Content ── */}

        {/* TAB 1: Chat & Q&A */}
        {activeTab === "chat" && (
          <div className="flex-1 flex flex-col min-h-0 bg-white">
            {/* Message History */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
              {messages.length === 0 && (
                <div className="h-full flex flex-col justify-center items-center text-center p-6 space-y-4 my-auto">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue shadow-inner">
                    <Sparkles size={24} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-ink">
                      Ask anything about this workspace
                    </h3>
                    <p className="text-xs text-slate mt-1 max-w-xs leading-relaxed">
                      I have vectorized all PRDs, OKRs, milestone roadmaps, tasks, and discussions across this workspace.
                    </p>
                  </div>

                  <div className="w-full pt-2 space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 text-left">
                      Suggested Questions
                    </p>
                    {QUICK_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => handleSendMessage(prompt)}
                        className="w-full text-left text-xs p-2.5 rounded-xl border border-border/80 hover:border-blue/50 hover:bg-blue-50/50 text-slate-700 hover:text-blue transition-all cursor-pointer flex items-center justify-between group"
                      >
                        <span>{prompt}</span>
                        <Zap size={12} className="opacity-0 group-hover:opacity-100 text-blue shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 text-xs leading-relaxed ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {msg.role === "assistant" && (
                    <div className="w-7 h-7 rounded-xl bg-blue-50 border border-blue-200 text-blue flex items-center justify-center shrink-0 mt-0.5">
                      <Bot size={14} />
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                      msg.role === "user"
                        ? "bg-blue text-white rounded-br-xs"
                        : "bg-offwhite border border-border/80 text-ink rounded-bl-xs"
                    }`}
                  >
                    {/* Assistant message content with citation badges */}
                    {msg.role === "assistant" ? (
                      <div className="space-y-2">
                        {msg.content ? (
                          <MarkdownContent content={msg.content} workspaceId={workspaceId} />
                        ) : (
                          <div className="flex items-center gap-2 text-slate-500 py-1">
                            <Loader2 size={13} className="animate-spin text-blue" />
                            <span>Thinking and analyzing workspace knowledge…</span>
                          </div>
                        )}

                        {/* Citations Footer */}
                        {msg.citations && msg.citations.length > 0 && (
                          <div className="pt-2 mt-2 border-t border-border/60">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
                              <Layers size={10} />
                              <span>Referenced Sources ({msg.citations.length})</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {msg.citations.map((c, i) => (
                                <CitationBadge
                                  key={c.id || i}
                                  entityType={c.entityType}
                                  entityId={c.entityId}
                                  title={c.title}
                                  snippet={c.snippet}
                                  url={c.url}
                                  workspaceId={workspaceId}
                                />
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Actions bar for assistant message */}
                        {msg.content && (
                          <div className="flex items-center justify-between pt-1 border-t border-border/40 text-[10px] text-slate-400">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => copyToClipboard(msg.content, msg.id)}
                                className="flex items-center gap-1 hover:text-ink transition-colors cursor-pointer"
                              >
                                {copiedId === msg.id ? (
                                  <>
                                    <Check size={11} className="text-emerald-600" />
                                    <span className="text-emerald-600">Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy size={11} />
                                    <span>Copy</span>
                                  </>
                                )}
                              </button>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                title="Helpful"
                                className="p-1 hover:text-blue hover:bg-blue-50 rounded transition-colors cursor-pointer"
                              >
                                <ThumbsUp size={11} />
                              </button>
                              <button
                                title="Not helpful"
                                className="p-1 hover:text-red-500 hover:bg-red-50 rounded transition-colors cursor-pointer"
                              >
                                <ThumbsDown size={11} />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>

                  {msg.role === "user" && (
                    <div className="w-7 h-7 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center shrink-0 mt-0.5">
                      <UserIcon size={14} />
                    </div>
                  )}
                </div>
              ))}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div className="p-3 border-t border-border bg-offwhite shrink-0">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="relative bg-white border border-border rounded-xl shadow-2xs focus-within:border-blue focus-within:ring-1 focus-within:ring-blue transition-all"
              >
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Ask a question or request a spec (e.g. 'Draft PRD for auth')..."
                  rows={2}
                  className="w-full text-xs text-ink placeholder:text-slate-400 p-2.5 pr-10 resize-none focus:outline-none rounded-xl"
                />
                <button
                  type="submit"
                  disabled={!inputValue.trim() || isStreaming}
                  className="absolute bottom-2 right-2 p-1.5 bg-blue text-white rounded-lg hover:bg-blue-mid disabled:opacity-40 disabled:hover:bg-blue transition-colors cursor-pointer"
                  title="Send message (Enter)"
                >
                  {isStreaming ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Send size={13} />
                  )}
                </button>
              </form>
              <div className="flex justify-between items-center mt-1.5 px-1 text-[10px] text-slate-400">
                <span>Enter to send, Shift+Enter for new line</span>
                <span>Grounds responses in workspace docs</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Executive Summary */}
        {activeTab === "executive" && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar bg-white">
            <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 flex items-start gap-3">
              <TrendingUp size={20} className="text-blue shrink-0 mt-0.5" />
              <div>
                <h3 className="text-xs font-bold text-ink">Weekly Executive Briefing</h3>
                <p className="text-[11px] text-slate mt-0.5">
                  Synthesizes active OKRs, milestone delivery forecasts, velocity, and blocker radar into an executive-ready briefing.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleGenerateExecutiveSummary}
                disabled={execLoading}
                className="flex-1 flex items-center justify-center gap-2 bg-blue text-white text-xs font-semibold py-2.5 px-4 rounded-xl hover:bg-blue-mid transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {execLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Sparkles size={14} />
                )}
                {execSummary ? "Regenerate Briefing" : "Generate Executive Briefing"}
              </button>

              {execSummary && (
                <button
                  onClick={() => copyToClipboard(execSummary, "exec")}
                  className="flex items-center gap-1.5 border border-border px-3 py-2.5 rounded-xl text-xs text-slate hover:text-ink hover:bg-offwhite transition-colors cursor-pointer"
                  title="Copy to Clipboard"
                >
                  {copiedId === "exec" ? (
                    <Check size={14} className="text-emerald-600" />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
              )}
            </div>

            {execLoading && (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-3 text-slate-500">
                <Loader2 size={24} className="animate-spin text-blue" />
                <p className="text-xs">Analyzing goals, velocity, and milestones…</p>
              </div>
            )}

            {execSummary && !execLoading && (
              <div className="space-y-4">
                <div className="p-4 bg-offwhite border border-border rounded-2xl text-xs leading-relaxed">
                  <MarkdownContent content={execSummary} workspaceId={workspaceId} />
                </div>

                {/* Save as Document Action */}
                <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-blue">
                    <FileText size={16} />
                    <span className="font-medium">Save report directly to Docs</span>
                  </div>

                  {execSavedDocId ? (
                    <Link
                      href={`/workspace/${workspaceId}/docs/${execSavedDocId}`}
                      className="flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:underline"
                    >
                      <FileCheck size={14} /> View Doc →
                    </Link>
                  ) : (
                    <button
                      onClick={handleSaveExecToDoc}
                      disabled={savingDoc}
                      className="flex items-center gap-1 text-xs font-semibold bg-blue text-white px-3 py-1.5 rounded-lg hover:bg-blue-mid transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {savingDoc ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
                      Save to PRD / Docs
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Daily Standup */}
        {activeTab === "standup" && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar bg-white">
            <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 flex items-start gap-3">
              <ListTodo size={20} className="text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-xs font-bold text-ink">Daily Team Standup & Blocker Digest</h3>
                <p className="text-[11px] text-slate mt-0.5">
                  Extracts completed items from the last 48 hours, today’s in-flight work, and active impediments requiring triage.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleGenerateStandup}
                disabled={standupLoading}
                className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 text-white text-xs font-semibold py-2.5 px-4 rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {standupLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Sparkles size={14} />
                )}
                {standupText ? "Regenerate Standup" : "Generate Daily Standup"}
              </button>

              {standupText && (
                <button
                  onClick={() => copyToClipboard(standupText, "standup")}
                  className="flex items-center gap-1.5 border border-border px-3 py-2.5 rounded-xl text-xs text-slate hover:text-ink hover:bg-offwhite transition-colors cursor-pointer"
                  title="Copy to Clipboard (for Slack / Teams)"
                >
                  {copiedId === "standup" ? (
                    <Check size={14} className="text-emerald-600" />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
              )}
            </div>

            {standupLoading && (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-3 text-slate-500">
                <Loader2 size={24} className="animate-spin text-emerald-600" />
                <p className="text-xs">Gathering recent task updates and blockers…</p>
              </div>
            )}

            {standupText && !standupLoading && (
              <div className="p-4 bg-offwhite border border-border rounded-2xl text-xs leading-relaxed">
                <MarkdownContent content={standupText} workspaceId={workspaceId} />
              </div>
            )}
          </div>
        )}

        {/* TAB 4: Knowledge Base Sync */}
        {activeTab === "knowledge" && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar bg-white">
            <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-100 flex items-start gap-3">
              <Database size={20} className="text-purple-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-xs font-bold text-ink">Workspace Knowledge Index</h3>
                <p className="text-[11px] text-slate mt-0.5">
                  Semantic vector representations of your workspace PRDs, goals, roadmaps, and tasks.
                </p>
              </div>
            </div>

            {/* Stats Breakdown */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-offwhite border border-border rounded-xl">
                <div className="text-[11px] text-slate">Documents & PRDs</div>
                <div className="text-lg font-bold text-ink mt-0.5">
                  {indexStats?.documentsCount ?? 0}
                </div>
              </div>
              <div className="p-3 bg-offwhite border border-border rounded-xl">
                <div className="text-[11px] text-slate">Goals & OKRs</div>
                <div className="text-lg font-bold text-ink mt-0.5">
                  {indexStats?.goalsCount ?? 0}
                </div>
              </div>
              <div className="p-3 bg-offwhite border border-border rounded-xl">
                <div className="text-[11px] text-slate">Milestones</div>
                <div className="text-lg font-bold text-ink mt-0.5">
                  {indexStats?.milestonesCount ?? 0}
                </div>
              </div>
              <div className="p-3 bg-offwhite border border-border rounded-xl">
                <div className="text-[11px] text-slate">Tasks & Comments</div>
                <div className="text-lg font-bold text-ink mt-0.5">
                  {indexStats?.tasksCount ?? 0}
                </div>
              </div>
            </div>

            {/* Total Chunks Card */}
            <div className="p-4 bg-purple-50/50 border border-purple-100 rounded-2xl flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-purple-900">
                  Vector Chunks in Database
                </div>
                <div className="text-[11px] text-purple-700 mt-0.5">
                  {indexStats?.totalChunks ?? 0} embedded vector slices
                </div>
              </div>
              <div className="text-xl font-bold text-purple-700">
                {indexStats?.totalChunks ?? 0}
              </div>
            </div>

            {/* Last Synced */}
            {indexStats?.lastIndexedAt && (
              <div className="text-[11px] text-slate-500 flex items-center gap-1.5 px-1">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>
                  Last indexed:{" "}
                  {new Date(indexStats.lastIndexedAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "numeric",
                  })}
                </span>
              </div>
            )}

            {/* Sync Action */}
            <button
              onClick={handleSyncKnowledge}
              disabled={isSyncingKnowledge}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-semibold py-3 px-4 rounded-xl hover:from-purple-700 hover:to-indigo-700 transition-all disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {isSyncingKnowledge ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              {isSyncingKnowledge ? "Vectorizing Workspace Knowledge…" : "Re-index Workspace Knowledge"}
            </button>

            {syncSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-center gap-2">
                <Check size={14} className="shrink-0" />
                <span>Knowledge base synchronized and vectorized successfully!</span>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: Roadmap Generator */}
        {activeTab === "roadmap" && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar bg-white">
            {/* Roadmap Header Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-100 flex items-start gap-3">
              <Rocket size={20} className="text-orange shrink-0 mt-0.5" />
              <div>
                <h3 className="text-xs font-bold text-ink">AI Roadmap Synthesizer</h3>
                <p className="text-[11px] text-slate mt-0.5 leading-relaxed">
                  Describe any project, product idea, or initiative — the AI will generate a structured goal with milestones, tasks, and target dates you can apply directly to your board.
                </p>
              </div>
            </div>

            {/* Generation Input */}
            {!roadmapResult && (
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5 block">
                    Project / Initiative Description
                  </label>
                  <textarea
                    value={roadmapInput}
                    onChange={(e) => setRoadmapInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        handleGenerateRoadmap();
                      }
                    }}
                    placeholder="Describe the project or goal you want to plan. Include scope, audience, and rough timeline. e.g. 'Launch a mobile companion app for our SaaS platform with push notifications and offline support by Q1 2026...'"
                    rows={6}
                    className="w-full text-xs text-ink placeholder:text-slate-400 p-3 border border-border rounded-xl bg-white shadow-2xs focus:outline-none focus:border-orange focus:ring-1 focus:ring-orange/40 resize-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-1 px-1">
                    {roadmapInput.length}/2000 characters · Ctrl+Enter to generate
                  </p>
                </div>

                <button
                  onClick={handleGenerateRoadmap}
                  disabled={roadmapLoading || roadmapInput.trim().length < 20}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white text-xs font-semibold py-3 px-4 rounded-xl hover:from-orange-600 hover:to-amber-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-xs"
                >
                  {roadmapLoading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Sparkles size={14} />
                  )}
                  {roadmapLoading
                    ? "Synthesizing Roadmap with AI…"
                    : "Generate Structured Roadmap"}
                </button>

                {roadmapError && !roadmapResult && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    <span>{roadmapError}</span>
                  </div>
                )}
              </div>
            )}

            {/* Generated Roadmap Preview */}
            {roadmapResult && (
              <div className="space-y-4">
                {/* Goal Preview Card */}
                <div className="p-3.5 rounded-2xl border border-border bg-offwhite/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600 flex items-center gap-1">
                      <FileCheck size={11} />
                      Proposed Goal
                    </div>
                    <button
                      onClick={() => {
                        setRoadmapResult(null);
                        setRoadmapError("");
                        setRoadmapAppliedGoal(null);
                      }}
                      className="text-[10px] text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                    >
                      Reset
                    </button>
                  </div>
                  <input
                    value={roadmapResult.goalTitle ?? ""}
                    onChange={(e) =>
                      setRoadmapResult((prev) =>
                        prev ? { ...prev, goalTitle: e.target.value } : prev
                      )
                    }
                    className="w-full text-sm font-bold text-ink p-2 border border-border/70 rounded-lg bg-white focus:outline-none focus:border-blue/60"
                  />
                  <textarea
                    value={roadmapResult.goalObjective ?? ""}
                    onChange={(e) =>
                      setRoadmapResult((prev) =>
                        prev ? { ...prev, goalObjective: e.target.value } : prev
                      )
                    }
                    rows={2}
                    className="w-full text-xs text-slate-700 p-2 border border-border/70 rounded-lg bg-white focus:outline-none focus:border-blue/60 resize-none"
                  />
                </div>

                {/* Milestones List */}
                <div className="space-y-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 px-1 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Layers size={11} />
                      Milestones & Breakdown
                    </span>
                    <span className="text-slate-400 font-normal normal-case">
                      {roadmapResult.milestones.length} milestones
                    </span>
                  </div>
                  {roadmapResult.milestones.map((ms, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl border border-border bg-white hover:border-blue/40 transition-colors space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="shrink-0 w-5 h-5 rounded-full bg-gradient-to-br from-indigo-500 to-blue-500 text-white text-[10px] font-bold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <input
                            value={ms.title}
                            onChange={(e) =>
                              setRoadmapResult((prev) => {
                                if (!prev) return prev;
                                const next = [...prev.milestones];
                                next[idx] = { ...next[idx], title: e.target.value };
                                return { ...prev, milestones: next };
                              })
                            }
                            className="min-w-0 flex-1 text-xs font-semibold text-ink p-1 border border-transparent hover:border-border/70 focus:border-blue/50 rounded focus:outline-none bg-transparent"
                          />
                        </div>
                        <input
                          type="date"
                          value={ms.targetDate ? ms.targetDate.slice(0, 10) : ""}
                          onChange={(e) =>
                            setRoadmapResult((prev) => {
                              if (!prev) return prev;
                              const next = [...prev.milestones];
                              next[idx] = { ...next[idx], targetDate: e.target.value };
                              return { ...prev, milestones: next };
                            })
                          }
                          className="shrink-0 text-[10px] text-slate-600 p-1 border border-border/70 rounded bg-white focus:outline-none focus:border-blue/50"
                        />
                      </div>
                      <textarea
                        value={ms.description ?? ""}
                        onChange={(e) =>
                          setRoadmapResult((prev) => {
                            if (!prev) return prev;
                            const next = [...prev.milestones];
                            next[idx] = { ...next[idx], description: e.target.value };
                            return { ...prev, milestones: next };
                          })
                        }
                        rows={1}
                        className="w-full text-[11px] text-slate-600 p-1 border border-transparent hover:border-border/70 focus:border-blue/50 rounded focus:outline-none bg-transparent resize-none"
                      />
                      {ms.suggestedTasks && ms.suggestedTasks.length > 0 && (
                        <div className="pt-1 flex flex-wrap gap-1">
                          {ms.suggestedTasks.map((t, ti) => (
                            <span
                              key={ti}
                              className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-full"
                            >
                              ✓ {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Goal Target */}
                <div className="space-y-2">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 px-1 flex items-center gap-1">
                    <FileText size={11} />
                    Apply to Goal
                  </label>
                  <select
                    value={roadmapCommitGoalId ?? "new"}
                    onChange={(e) => setRoadmapCommitGoalId(e.target.value)}
                    disabled={roadmapCommitLoading}
                    className="w-full text-xs p-2.5 border border-border rounded-xl bg-white focus:outline-none focus:border-blue/50 disabled:opacity-60 cursor-pointer"
                  >
                    <option value="new">✨ Create a new Goal from the proposal above</option>
                    <optgroup label="Existing Goals">
                      {goalsLoading && (
                        <option disabled>Loading goals…</option>
                      )}
                      {!goalsLoading && workspaceGoals.length === 0 && (
                        <option disabled>No existing goals</option>
                      )}
                      {workspaceGoals.map((g) => (
                        <option key={g.id} value={g.id}>
                          📎 {g.title}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                {/* Success Banner */}
                {roadmapAppliedGoal && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-1.5">
                    <div className="flex items-center gap-2 text-emerald-700 font-semibold">
                      <Check size={14} />
                      Roadmap applied to board successfully
                    </div>
                    <Link
                      href={`/goals/${roadmapAppliedGoal.id}`}
                      className="text-emerald-700 hover:text-emerald-800 underline underline-offset-2 flex items-center gap-1"
                    >
                      Open Goal: {roadmapAppliedGoal.title}
                      <ExternalLink size={11} />
                    </Link>
                  </div>
                )}

                {/* Error Banner */}
                {roadmapError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertCircle size={14} className="shrink-0 mt-0.5" />
                      <span className="flex-1">{roadmapError}</span>
                    </div>
                    {roadmapError.includes("You can resume") && (
                      <button
                        onClick={() => handleCommitRoadmap({ resume: true })}
                        disabled={roadmapCommitLoading}
                        className="w-full flex items-center justify-center gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-[11px] font-semibold py-2 px-3 rounded-lg hover:from-emerald-600 hover:to-teal-600 transition-all disabled:opacity-50 cursor-pointer"
                      >
                        <RefreshCw size={12} />
                        Continue from where stopped (apply remaining milestones)
                      </button>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="space-y-2 pt-2">
                  <button
                    onClick={() => handleCommitRoadmap()}
                    disabled={roadmapCommitLoading}
                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-blue-600 text-white text-xs font-semibold py-3 px-4 rounded-xl hover:from-indigo-700 hover:to-blue-700 transition-all disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    {roadmapCommitLoading ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Rocket size={14} />
                    )}
                    {roadmapCommitLoading
                      ? "Populating the board…"
                      : "Populate Board with this Roadmap"}
                  </button>
                  <button
                    onClick={() => {
                      setRoadmapResult(null);
                      setRoadmapError("");
                      setRoadmapAppliedGoal(null);
                    }}
                    disabled={roadmapCommitLoading}
                    className="w-full text-xs text-slate-500 hover:text-ink py-2 transition-colors cursor-pointer disabled:opacity-40"
                  >
                    ← Generate a different roadmap
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
