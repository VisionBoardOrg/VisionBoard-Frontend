"use client";

import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown, Search, ChevronLeft, ChevronRight } from "lucide-react";

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  className?: string;
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  getRowKey: (row: T) => string;
  searchable?: boolean;
  searchPlaceholder?: string;
  pageSize?: number;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  isLoading?: boolean;
  serverPagination?: {
    page: number;
    totalItems: number;
    pageSize: number;
    onPageChange: (page: number) => void;
  };
}

type SortDir = "asc" | "desc" | null;

function getValue<T>(row: T, key: string): unknown {
  return (row as Record<string, unknown>)[key];
}

export default function DataTable<T>({
  columns,
  data,
  getRowKey,
  searchable = true,
  searchPlaceholder = "Search…",
  pageSize: clientPageSize = 20,
  onRowClick,
  emptyMessage = "No records found.",
  isLoading = false,
  serverPagination,
}: DataTableProps<T>) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [clientPage, setClientPage] = useState(1);

  // Search
  const filtered = useMemo(() => {
    if (!query.trim()) return data;
    const q = query.toLowerCase();
    return data.filter((row) =>
      columns.some((col) => {
        const v = getValue(row, col.key);
        return typeof v === "string"
          ? v.toLowerCase().includes(q)
          : typeof v === "number"
          ? String(v).includes(q)
          : false;
      })
    );
  }, [data, query, columns]);

  // Sort
  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return filtered;
    return [...filtered].sort((a, b) => {
      const av = getValue(a, sortKey);
      const bv = getValue(b, sortKey);
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  // Pagination
  //
  // When serverPagination is provided:
  //   - The parent component fetches a single server-rendered page.
  //   - We render ALL of `data` as-is (skip client-side slicing).
  //   - Page controls are driven by the server totals and call onPageChange.
  //
  // Otherwise (client-only mode):
  //   - Keep the original behaviour: slice `sorted` client-side.
  const effectivePageSize = serverPagination?.pageSize ?? clientPageSize;
  const totalPages = serverPagination
    ? Math.max(1, Math.ceil(serverPagination.totalItems / effectivePageSize))
    : Math.max(1, Math.ceil(sorted.length / effectivePageSize));

  const paged = serverPagination
    ? sorted
    : sorted.slice((clientPage - 1) * effectivePageSize, clientPage * effectivePageSize);

  const currentPage = serverPagination ? serverPagination.page : clientPage;

  function handleSort(key: string) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortKey(null);
      setSortDir(null);
    }
    setClientPage(1);
    serverPagination?.onPageChange(1);
  }

  function handleSearch(v: string) {
    setQuery(v);
    setClientPage(1);
    serverPagination?.onPageChange(1);
  }

  function handlePrevPage() {
    if (serverPagination) {
      serverPagination.onPageChange(Math.max(1, serverPagination.page - 1));
    } else {
      setClientPage((p) => Math.max(1, p - 1));
    }
  }

  function handleNextPage() {
    if (serverPagination) {
      serverPagination.onPageChange(Math.min(totalPages, serverPagination.page + 1));
    } else {
      setClientPage((p) => Math.min(totalPages, p + 1));
    }
  }

  const displayedCount = serverPagination ? serverPagination.totalItems : sorted.length;

  return (
    <div className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
      {searchable && (
        <div className="p-4 border-b border-border">
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted" />
            <input
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-9 pr-4 py-2 bg-offwhite border border-border rounded-xl text-sm font-medium text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-all"
            />
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-offwhite/60">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left text-xs font-bold text-slate uppercase tracking-wide whitespace-nowrap ${col.className ?? ""} ${
                    col.sortable ? "cursor-pointer select-none hover:text-ink" : ""
                  }`}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                >
                  <span className="flex items-center gap-1">
                    {col.header}
                    {col.sortable &&
                      (sortKey === col.key ? (
                        sortDir === "asc" ? (
                          <ChevronUp className="w-3.5 h-3.5 text-blue" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-blue" />
                        )
                      ) : (
                        <ChevronsUpDown className="w-3.5 h-3.5 text-muted" />
                      ))}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3">
                      <div className="h-4 bg-border rounded animate-pulse w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : paged.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-sm text-muted font-medium"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paged.map((row) => (
                <tr
                  key={getRowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`border-b border-border last:border-0 transition-colors ${
                    onRowClick ? "cursor-pointer hover:bg-blue-faint/40" : ""
                  }`}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 text-ink font-medium ${col.className ?? ""}`}
                    >
                      {col.render
                        ? col.render(row)
                        : String(getValue(row, col.key) ?? "—")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border text-xs font-medium text-slate">
          <span>
            {displayedCount.toLocaleString()} result{displayedCount !== 1 ? "s" : ""} · Page{" "}
            {currentPage} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrevPage}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg hover:bg-offwhite disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg hover:bg-offwhite disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
