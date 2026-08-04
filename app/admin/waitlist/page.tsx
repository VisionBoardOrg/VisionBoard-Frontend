"use client";

import React, { useState, useEffect, useRef } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import {
  Send,
  Filter,
  CheckCircle2,
  Clock,
  Search,
  Trash2,
  Download,
  RefreshCw,
  AlertTriangle,
  LogOut,
} from "lucide-react";

interface WaitlistRecord {
  id: string;
  email: string;
  fullName: string;
  company?: string;
  teamSize?: string;
  role: string;
  painPoint?: string;
  referralCode: string;
  referralCount: number;
  position: number;
  status: "PENDING" | "INVITED" | "REGISTERED" | "EXPIRED";
  inviteToken?: string;
  createdAt: string;
}

export default function AdminWaitlistPage() {
  const [entries, setEntries] = useState<WaitlistRecord[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isDispatching, setIsDispatching] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isNormalizing, setIsNormalizing] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMessage({ text, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMessage(null), 4000);
  };

  const fetchWaitlist = async () => {
    setIsLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (statusFilter !== "ALL") queryParams.set("status", statusFilter);
      const res = await fetch(`/api/admin/waitlist?${queryParams.toString()}`);
      const json = await res.json();
      if (json.success && json.data) {
        setEntries(json.data.entries);
        setTotalCount(json.data.total);
      }
    } catch {
      showToast("Failed to load waitlist data.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    queueMicrotask(() => {
      fetchWaitlist();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const filteredEntries = entries.filter((e) => {
    const q = searchQuery.toLowerCase();
    return (
      e.fullName.toLowerCase().includes(q) ||
      e.email.toLowerCase().includes(q) ||
      (e.company && e.company.toLowerCase().includes(q))
    );
  });

  const allFilteredSelected =
    filteredEntries.length > 0 && filteredEntries.every((e) => selectedIds.includes(e.id));
  const someFilteredSelected = filteredEntries.some((e) => selectedIds.includes(e.id));

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => prev.filter((id) => !filteredEntries.find((e) => e.id === id)));
    } else {
      const newIds = filteredEntries.map((e) => e.id);
      setSelectedIds((prev) => Array.from(new Set([...prev, ...newIds])));
    }
  };

  const selectAllPending = () => {
    const pendingIds = filteredEntries.filter((e) => e.status === "PENDING").map((e) => e.id);
    setSelectedIds((prev) => Array.from(new Set([...prev, ...pendingIds])));
  };

  const clearSelection = () => setSelectedIds([]);

  const handleDispatchInvites = async () => {
    if (selectedIds.length === 0) return;
    setIsDispatching(true);
    try {
      const res = await fetch("/api/admin/waitlist/dispatch-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        showToast(`Dispatched ${json.data.invitedCount} magic invite token(s)!`);
        clearSelection();
        fetchWaitlist();
      } else {
        showToast("Failed to dispatch invites.", "error");
      }
    } catch {
      showToast("Failed to dispatch invites.", "error");
    } finally {
      setIsDispatching(false);
    }
  };

  const handleExportCSV = () => {
    const target =
      selectedIds.length > 0
        ? filteredEntries.filter((e) => selectedIds.includes(e.id))
        : filteredEntries;
    if (target.length === 0) return;
    const headers = [
      "Position","Full Name","Email","Company","Team Size",
      "Role","Pain Point","Referral Code","Referral Count","Status","Joined At",
    ];
    const rows = target.map((e) => [
      e.position,
      `"${e.fullName.replace(/"/g, '""')}"`,
      e.email,
      `"${(e.company || "").replace(/"/g, '""')}"`,
      e.teamSize || "",
      e.role,
      `"${(e.painPoint || "").replace(/"/g, '""')}"`,
      e.referralCode,
      e.referralCount,
      e.status,
      new Date(e.createdAt).toISOString(),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `waitlist-export-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${target.length} record(s) as CSV.`);
  };

  const handleDelete = async () => {
    if (selectedIds.length === 0) return;
    setIsDeleting(true);
    setShowDeleteConfirm(false);
    try {
      const res = await fetch("/api/admin/waitlist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(`Deleted ${json.data.deletedCount} entry(s). Positions reindexed.`);
        clearSelection();
        fetchWaitlist();
      } else {
        showToast("Failed to delete entries.", "error");
      }
    } catch {
      showToast("Failed to delete entries.", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleNormalize = async () => {
    setIsNormalizing(true);
    try {
      const res = await fetch("/api/admin/waitlist?action=normalize", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        showToast("Positions reindexed successfully.");
        fetchWaitlist();
      }
    } catch {
      showToast("Failed to normalize positions.", "error");
    } finally {
      setIsNormalizing(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } finally {
      window.location.href = "/admin/login";
    }
  };

  const selectedCount = selectedIds.length;

  return (
    <div className="min-h-screen flex flex-col bg-offwhite">
      <Header />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 space-y-6">

        {toastMessage && (
          <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg border text-sm font-semibold ${toastMessage.type === "error" ? "bg-red-50 border-red-200 text-red-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"}`}>
            {toastMessage.text}
            <button onClick={() => setToastMessage(null)} className="opacity-60 hover:opacity-100 ml-2">x</button>
          </div>
        )}

        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl border border-border shadow-xl p-6 max-w-sm w-full space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h2 className="font-bold text-ink text-base">Delete {selectedCount} entry(s)?</h2>
                  <p className="text-xs text-slate mt-0.5">This action cannot be undone.</p>
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate border border-border hover:bg-offwhite transition-colors">Cancel</button>
                <button onClick={handleDelete} className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors">Delete</button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-border p-5 sm:p-6 shadow-sm flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-blue bg-blue-faint px-2.5 py-0.5 rounded-md border border-blue-light uppercase tracking-wider">Admin Console</span>
              <span className="text-xs text-slate">Waitlist Management</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-ink">Waitlist Dispatcher</h1>
            <p className="text-sm text-slate">Inspect candidates, evaluate company size, and dispatch magic sign-up tokens.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <div className="text-left sm:text-right">
              <p className="text-2xl font-bold text-ink">{totalCount.toLocaleString()}</p>
              <p className="text-xs text-slate font-medium">Total Applicants</p>
            </div>
            <button onClick={handleDispatchInvites} disabled={selectedCount === 0 || isDispatching} className="flex items-center gap-2 bg-blue text-white px-4 sm:px-5 py-2.5 rounded-xl font-semibold text-xs shadow-sm hover:bg-blue-mid transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <Send className="w-4 h-4" />
              <span>{isDispatching ? "Sending..." : `Dispatch Invites (${selectedCount})`}</span>
            </button>
            <button onClick={handleLogout} className="flex items-center gap-2 bg-slate-100 text-slate-700 hover:bg-slate-200 px-4 py-2.5 rounded-xl font-semibold text-xs transition-colors border border-slate-200" title="Logout of Admin Console">
              <LogOut className="w-4 h-4 text-slate-500" />
              <span>Logout</span>
            </button>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-border shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-slate absolute left-3 top-3" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by name, email, company..." className="w-full pl-9 pr-3 py-2 bg-offwhite/50 border border-border rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue" />
          </div>
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-1.5 text-xs text-slate font-semibold">
              <Filter className="w-3.5 h-3.5" /> Filter:
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-offwhite border border-border rounded-xl px-3 py-1.5 text-xs font-semibold text-ink">
              <option value="ALL">All Statuses</option>
              <option value="PENDING">Pending Queue</option>
              <option value="INVITED">Invited (VIP Token)</option>
              <option value="REGISTERED">Registered Account</option>
            </select>
            <button onClick={selectAllPending} className="text-xs font-semibold text-blue bg-blue-faint hover:bg-blue-light/50 px-3 py-1.5 rounded-xl border border-blue-light transition-colors">Select Pending</button>
            <button onClick={handleNormalize} disabled={isNormalizing} title="Re-index positions to remove gaps or duplicates" className="text-xs font-semibold text-slate bg-offwhite hover:bg-border/50 px-3 py-1.5 rounded-xl border border-border transition-colors flex items-center gap-1.5 disabled:opacity-50">
              <RefreshCw className={`w-3 h-3 ${isNormalizing ? "animate-spin" : ""}`} />
              Fix Positions
            </button>
          </div>
        </div>

        {selectedCount > 0 && (
          <div className="bg-ink text-white rounded-2xl px-5 py-3 flex items-center justify-between gap-4 shadow-lg">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold">{selectedCount} selected</span>
              <button onClick={clearSelection} className="text-xs text-white/60 hover:text-white underline underline-offset-2">Clear</button>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleExportCSV} className="flex items-center gap-1.5 text-xs font-semibold bg-white/10 hover:bg-white/20 border border-white/20 px-3 py-1.5 rounded-xl transition-colors">
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
              <button onClick={() => setShowDeleteConfirm(true)} disabled={isDeleting} className="flex items-center gap-1.5 text-xs font-semibold bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-xl transition-colors disabled:opacity-50">
                <Trash2 className="w-3.5 h-3.5" />
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
              <button onClick={handleDispatchInvites} disabled={isDispatching} className="flex items-center gap-1.5 text-xs font-semibold bg-blue hover:bg-blue-mid px-3 py-1.5 rounded-xl transition-colors disabled:opacity-50">
                <Send className="w-3.5 h-3.5" />
                {isDispatching ? "Sending..." : "Dispatch Invites"}
              </button>
            </div>
          </div>
        )}

        {selectedCount === 0 && filteredEntries.length > 0 && (
          <div className="flex justify-end">
            <button onClick={handleExportCSV} className="flex items-center gap-1.5 text-xs font-semibold text-slate hover:text-ink bg-white border border-border hover:border-slate px-3 py-1.5 rounded-xl transition-colors">
              <Download className="w-3.5 h-3.5" /> Export All as CSV
            </button>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-offwhite/60 border-b border-border text-[11px] font-bold text-slate uppercase tracking-wider">
                <th className="p-4 w-10">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    ref={(el) => { if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected; }}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-border text-blue focus:ring-blue/30 cursor-pointer"
                    title={allFilteredSelected ? "Deselect all" : "Select all"}
                  />
                </th>
                <th className="p-4">Candidate</th>
                <th className="p-4">Company &amp; Team</th>
                <th className="p-4">Role &amp; Interest</th>
                <th className="p-4">Position</th>
                <th className="p-4">Referrals</th>
                <th className="p-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-xs">
              {isLoading ? (
                <tr><td colSpan={7} className="p-8 text-center text-slate">Loading waitlist data...</td></tr>
              ) : filteredEntries.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-slate">No waitlist applicants match your filters.</td></tr>
              ) : (
                filteredEntries.map((e) => {
                  const isSelected = selectedIds.includes(e.id);
                  return (
                    <tr key={e.id} onClick={() => toggleSelect(e.id)} className={`hover:bg-offwhite/50 transition-colors cursor-pointer ${isSelected ? "bg-blue-faint/40" : ""}`}>
                      <td className="p-4" onClick={(ev) => ev.stopPropagation()}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(e.id)} className="w-4 h-4 rounded border-border text-blue focus:ring-blue/30 cursor-pointer" />
                      </td>
                      <td className="p-4 font-medium">
                        <p className="font-bold text-ink">{e.fullName}</p>
                        <p className="text-slate text-[11px] font-mono">{e.email}</p>
                      </td>
                      <td className="p-4">
                        <p className="font-semibold text-ink">{e.company || "Independent"}</p>
                        <p className="text-slate text-[11px]">{e.teamSize || "1-10"} people</p>
                      </td>
                      <td className="p-4">
                        <span className="capitalize font-semibold text-slate">{e.role.replace("_", " ")}</span>
                        {e.painPoint && <p className="text-[10px] text-blue font-medium mt-0.5">Excited for: {e.painPoint}</p>}
                      </td>
                      <td className="p-4 font-mono font-bold text-blue">#{e.position}</td>
                      <td className="p-4 font-bold text-slate">+{e.referralCount * 5} spots ({e.referralCount})</td>
                      <td className="p-4">
                        {e.status === "INVITED" ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200"><CheckCircle2 className="w-3 h-3" /> Token Sent</span>
                        ) : e.status === "REGISTERED" ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue bg-blue-faint px-2 py-0.5 rounded-md border border-blue-light">Registered User</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate bg-slate-100 px-2 py-0.5 rounded-md border border-border"><Clock className="w-3 h-3 text-slate" /> In Queue</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
