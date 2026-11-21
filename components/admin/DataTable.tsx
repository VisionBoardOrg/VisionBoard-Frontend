"use client";

import { useState, useMemo } from "react";
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

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
  /** Additional object keys to match in client-side search (e.g. "email") */
  searchableKeys?: string[];
  /** When provided, delegates search to the parent (server-side search mode) without client-side filtering */
  onSearchChange?: (query: string) => void;
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
  searchableKeys,
  onSearchChange,
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

  const isServerSearch = Boolean(onSearchChange);

  // Client-side search (skipped when server search is delegated via onSearchChange)
  const filtered = useMemo(() => {
    if (isServerSearch || !query.trim()) return data;
    const q = query.toLowerCase();
    const keysToSearch = Array.from(
      new Set([...columns.map((c) => c.key), ...(searchableKeys ?? [])])
    );
    return data.filter((row) =>
      keysToSearch.some((key) => {
        const v = getValue(row, key);
        return typeof v === "string"
          ? v.toLowerCase().includes(q)
          : typeof v === "number"
          ? String(v).includes(q)
          : false;
      })
    );
  }, [data, query, columns, searchableKeys, isServerSearch]);

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
    if (!serverPagination) {
      setClientPage(1);
    }
  }

  function handleSearch(v: string) {
    setQuery(v);
    if (onSearchChange) {
      onSearchChange(v);
    } else {
      setClientPage(1);
      serverPagination?.onPageChange(1);
    }
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
            <Search
              className="absolute left-3 top-2.5 w-4 h-4 text-muted pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Search table"
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
              {columns.map((col) => {
                const ariaSort = col.sortable
                  ? sortKey === col.key
                    ? sortDir === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                  : undefined;

                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={ariaSort}
                    className={`px-4 py-3 text-left text-xs font-bold text-slate uppercase tracking-wide whitespace-nowrap ${col.className ?? ""}`}
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => handleSort(col.key)}
                        className="inline-flex items-center gap-1 uppercase tracking-wide font-bold text-slate hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-blue/40 rounded cursor-pointer select-none"
                      >
                        <span>{col.header}</span>
                        {sortKey === col.key ? (
                          sortDir === "asc" ? (
                            <ChevronUp className="w-3.5 h-3.5 text-blue" aria-hidden="true" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-blue" aria-hidden="true" />
                          )
                        ) : (
                          <ChevronsUpDown className="w-3.5 h-3.5 text-muted" aria-hidden="true" />
                        )}
                      </button>
                    ) : (
                      <span>{col.header}</span>
                    )}
                  </th>
                );
              })}
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
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                  className={`border-b border-border last:border-0 transition-colors ${
                    onRowClick
                      ? "cursor-pointer hover:bg-blue-faint/40 focus:outline-none focus-visible:bg-blue-faint/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue/40"
                      : ""
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
              type="button"
              onClick={handlePrevPage}
              disabled={currentPage === 1}
              aria-label="Previous page"
              className="p-1.5 rounded-lg hover:bg-offwhite disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
              aria-label="Next page"
              className="p-1.5 rounded-lg hover:bg-offwhite disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
