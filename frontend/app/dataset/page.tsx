"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { API_BASE } from "@/lib/config";

interface DatasetMeta {
  name: string;
  description: string;
  input_columns: string[];
  output_columns: string[];
  model_type: "seq2seq" | "classification" | "extraction" | "reward";
  count: number;
}

interface DatasetPage {
  name: string;
  total: number;
  limit: number;
  offset: number;
  samples: DatasetSample[];
}

interface DatasetSample {
  session_id: string;
  [column: string]: string | number | boolean | null;
}

const PAGE_SIZE = 20;

function formatName(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const modelTypeCls: Record<DatasetMeta["model_type"], string> = {
  seq2seq:
    "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300",
  classification:
    "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  extraction:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  reward:
    "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
};

export default function DatasetPageComponent() {
  const [datasets, setDatasets] = useState<DatasetMeta[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selected, setSelected] = useState<DatasetMeta | null>(null);
  const [page, setPage] = useState<DatasetPage | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [csvLoading, setCsvLoading] = useState(false);

  const loadDatasets = useCallback(() => {
    setListLoading(true);
    setListError(null);
    fetch(`${API_BASE}/datasets`)
      .then((r) => {
        if (!r.ok) throw new Error(`Server error ${r.status}`);
        return r.json() as Promise<DatasetMeta[]>;
      })
      .then(setDatasets)
      .catch((e) =>
        setListError(e instanceof Error ? e.message : "Failed to load"),
      )
      .finally(() => setListLoading(false));
  }, []);

  useEffect(() => {
    loadDatasets();
  }, [loadDatasets]);

  const loadPage = useCallback(
    async (meta: DatasetMeta, newOffset: number) => {
      setPageLoading(true);
      setPageError(null);
      try {
        const res = await fetch(
          `${API_BASE}/datasets/${meta.name}?limit=${PAGE_SIZE}&offset=${newOffset}`,
        );
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        const data: DatasetPage = await res.json();
        setPage(data);
        setOffset(newOffset);
      } catch (e) {
        setPageError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setPageLoading(false);
      }
    },
    [],
  );

  const selectDataset = useCallback(
    (meta: DatasetMeta) => {
      if (meta.count === 0) return;
      setSelected(meta);
      setPage(null);
      setOffset(0);
      loadPage(meta, 0);
    },
    [loadPage],
  );

  const downloadCsv = useCallback(async () => {
    if (!selected) return;
    setCsvLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/datasets/${selected.name}?limit=500&offset=0`,
      );
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data: DatasetPage = await res.json();
      const cols = [
        "session_id",
        ...selected.input_columns,
        ...selected.output_columns,
      ];
      const header = cols.join(",");
      const rows = data.samples.map((s) =>
        cols
          .map((c) => {
            const v = s[c];
            if (v == null) return "";
            const str = String(v);
            return str.includes(",") || str.includes('"') || str.includes("\n")
              ? `"${str.replace(/"/g, '""')}"`
              : str;
          })
          .join(","),
      );
      const csv = [header, ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selected.name}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // download failure is non-critical
    } finally {
      setCsvLoading(false);
    }
  }, [selected]);

  const columns = selected
    ? ["session_id", ...selected.input_columns, ...selected.output_columns]
    : [];

  const totalPages = page ? Math.ceil(page.total / PAGE_SIZE) : 0;
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const rangeStart = page && page.total > 0 ? offset + 1 : 0;
  const rangeEnd = page ? Math.min(offset + PAGE_SIZE, page.total) : 0;

  return (
    <div className="h-screen flex flex-col bg-linear-to-br from-indigo-50 to-violet-100 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between px-5 py-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700">
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">
          Datasets
        </h1>
        <Link
          href="/"
          className="px-3 py-1.5 bg-slate-600 hover:bg-slate-700 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          ← Back
        </Link>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left — dataset list */}
        <div className="w-72 shrink-0 border-r border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/60 overflow-y-auto flex flex-col gap-2 p-3">
          {listLoading && (
            <div className="flex items-center justify-center py-12 text-slate-400 text-sm gap-2">
              <svg
                className="w-4 h-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <circle cx={12} cy={12} r={10} strokeOpacity={0.25} />
                <path d="M12 2a10 10 0 0 1 10 10" />
              </svg>
              Loading…
            </div>
          )}
          {listError && (
            <div className="flex flex-col gap-2 p-2">
              <p className="text-sm text-red-500">{listError}</p>
              <button
                onClick={loadDatasets}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-800 text-white text-sm rounded-lg transition-colors"
              >
                Retry
              </button>
            </div>
          )}
          {datasets.map((ds) => (
            <button
              key={ds.name}
              onClick={() => selectDataset(ds)}
              disabled={ds.count === 0}
              title={
                ds.count === 0 ? "No qualifying records yet" : undefined
              }
              className={`text-left w-full rounded-lg p-3 border transition-all ${
                selected?.name === ds.name
                  ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 shadow-sm ring-1 ring-indigo-500/30"
                  : ds.count === 0
                    ? "border-slate-200 dark:border-slate-700 bg-white/40 dark:bg-slate-800/40 opacity-50 cursor-not-allowed"
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600"
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-sm font-semibold text-slate-900 dark:text-white leading-tight">
                  {formatName(ds.name)}
                </span>
                <span
                  className={`text-xs px-1.5 py-0.5 rounded font-semibold shrink-0 ${modelTypeCls[ds.model_type]}`}
                >
                  {ds.model_type}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 leading-relaxed">
                {ds.description}
              </p>
              <div className="flex flex-wrap gap-1 mb-2">
                {ds.input_columns.map((c) => (
                  <span
                    key={c}
                    className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 font-mono"
                  >
                    {c}
                  </span>
                ))}
                <span className="text-xs text-slate-300 dark:text-slate-600 self-center">
                  →
                </span>
                {ds.output_columns.map((c) => (
                  <span
                    key={c}
                    className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300 font-mono"
                  >
                    {c}
                  </span>
                ))}
              </div>
              <span
                className={`text-xs font-mono ${ds.count === 0 ? "text-slate-400" : "text-slate-600 dark:text-slate-300"}`}
              >
                {ds.count.toLocaleString()} records
              </span>
            </button>
          ))}
        </div>

        {/* Right — preview */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500 gap-2">
              <svg
                viewBox="0 0 24 24"
                className="w-10 h-10 opacity-30"
                fill="currentColor"
              >
                <path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5zm0 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2z" />
              </svg>
              <p className="text-sm font-medium">Select a dataset to preview</p>
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="shrink-0 flex items-center justify-between px-4 py-2.5 bg-white/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">
                    {formatName(selected.name)}
                  </span>
                  {page && (
                    <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      {rangeStart}–{rangeEnd} of{" "}
                      {page.total.toLocaleString()} records
                    </span>
                  )}
                  {pageLoading && (
                    <svg
                      className="w-4 h-4 animate-spin text-slate-400"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <circle cx={12} cy={12} r={10} strokeOpacity={0.25} />
                      <path d="M12 2a10 10 0 0 1 10 10" />
                    </svg>
                  )}
                  {pageError && (
                    <span className="text-xs text-red-500">{pageError}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => loadPage(selected, offset - PAGE_SIZE)}
                    disabled={offset === 0 || pageLoading}
                    className="px-3 py-1.5 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    ← Prev
                  </button>
                  <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    {currentPage} / {totalPages || "—"}
                  </span>
                  <button
                    onClick={() => loadPage(selected, offset + PAGE_SIZE)}
                    disabled={
                      !page ||
                      offset + PAGE_SIZE >= page.total ||
                      pageLoading
                    }
                    className="px-3 py-1.5 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next →
                  </button>
                  <button
                    onClick={downloadCsv}
                    disabled={csvLoading}
                    className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    {csvLoading ? (
                      <svg
                        className="w-3.5 h-3.5 animate-spin"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <circle cx={12} cy={12} r={10} strokeOpacity={0.25} />
                        <path d="M12 2a10 10 0 0 1 10 10" />
                      </svg>
                    ) : (
                      <svg
                        viewBox="0 0 16 16"
                        className="w-3.5 h-3.5 fill-current"
                      >
                        <path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14Z" />
                        <path d="M7.25 7.689V2a.75.75 0 0 1 1.5 0v5.689l1.97-1.97a.749.749 0 1 1 1.06 1.06l-3.25 3.25a.749.749 0 0 1-1.06 0L4.22 6.779a.749.749 0 1 1 1.06-1.06l1.97 1.97Z" />
                      </svg>
                    )}
                    CSV
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="flex-1 overflow-auto">
                {page && page.total === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500 gap-1">
                    <p className="text-sm font-medium">No records</p>
                    <p className="text-xs">
                      This dataset has no qualifying data yet
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-xs border-collapse">
                    <thead className="sticky top-0 z-10">
                      <tr>
                        {columns.map((col) => {
                          const isInput =
                            selected.input_columns.includes(col);
                          const isOutput =
                            selected.output_columns.includes(col);
                          return (
                            <th
                              key={col}
                              className={`px-3 py-2 text-left font-semibold uppercase tracking-wide whitespace-nowrap border-b border-slate-200 dark:border-slate-700 ${
                                isInput
                                  ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300"
                                  : isOutput
                                    ? "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300"
                                    : "bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                              }`}
                            >
                              {col}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {page?.samples.map((sample, i) => (
                        <tr
                          key={sample.session_id}
                          className={
                            i % 2 === 0
                              ? "bg-white dark:bg-slate-900"
                              : "bg-slate-50/60 dark:bg-slate-800/60"
                          }
                        >
                          {columns.map((col) => (
                            <td
                              key={col}
                              className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 align-top max-w-xs"
                            >
                              <CellValue value={sample[col]} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CellValue({ value }: { value: DatasetSample[string] }) {
  const [expanded, setExpanded] = useState(false);

  if (value === null || value === undefined) {
    return (
      <span className="text-slate-300 dark:text-slate-600 select-none">—</span>
    );
  }

  if (typeof value === "boolean") {
    return (
      <span
        className={`inline-block px-1.5 py-0.5 rounded font-semibold ${
          value
            ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
            : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
        }`}
      >
        {value ? "Yes" : "No"}
      </span>
    );
  }

  const str = String(value);
  const isLong = str.length > 120 || str.includes("\n");

  if (!isLong) {
    return (
      <span className="text-slate-700 dark:text-slate-300 break-words">
        {str}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <span
        className={`text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words leading-relaxed ${
          expanded ? "" : "line-clamp-3"
        }`}
      >
        {str}
      </span>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 text-xs font-medium self-start transition-colors"
      >
        {expanded ? "Show less" : "Show more"}
      </button>
    </div>
  );
}
