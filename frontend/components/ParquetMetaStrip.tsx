"use client";

import { useEffect, useState } from "react";
import type { ParquetDatasetKey } from "@/lib/parquet-datasets";

interface Meta {
  dataset: ParquetDatasetKey;
  label: string;
  container: string;
  blobPath: string;
  lastModifiedUtc: string | null;
  contentLengthBytes: number | null;
  etag: string | null;
  downloadedAtUtc: string | null;
  cacheExpiresAtUtc: string | null;
  cacheTtlMs: number;
}

function fmtBytes(bytes: number | null): string {
  if (bytes == null) return "\u2014";
  const MB = 1024 * 1024;
  const GB = MB * 1024;
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "\u2014";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "in the future";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function fmtAbs(iso: string | null): string {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function Field({
  label,
  value,
  sub,
  title,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  title?: string;
  tone?: "default" | "warn" | "ok";
}) {
  const toneClass =
    tone === "warn"
      ? "text-amber-300"
      : tone === "ok"
        ? "text-emerald-300"
        : "text-gray-200";
  return (
    <div title={title}>
      <div className="text-[9px] font-bold uppercase tracking-wider text-gray-500">
        {label}
      </div>
      <div className={`text-[11px] font-mono leading-tight ${toneClass}`}>
        {value}
      </div>
      {sub && (
        <div className="text-[10px] font-mono leading-tight text-gray-500">
          {sub}
        </div>
      )}
    </div>
  );
}

export default function ParquetMetaStrip({
  dataset,
  refreshKey = 0,
}: {
  dataset: ParquetDatasetKey;
  /** Bump to force a re-fetch (e.g. after user clicks Refresh). */
  refreshKey?: number;
}) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    setMeta(null);
    setError(null);
    fetch(`/api/parquet-meta?dataset=${dataset}&_cb=${refreshKey}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: Meta) => setMeta(data))
      .catch((e: Error) => setError(e.message));
  }, [dataset, refreshKey]);

  // tick every 30s so relative timestamps stay fresh
  useEffect(() => {
    const id = setInterval(() => setTick((v) => v + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const teaser = error
    ? "unavailable"
    : meta
      ? fmtRelative(meta.lastModifiedUtc)
      : "loading\u2026";

  return (
    <div className="w-full rounded-md border border-gray-800 bg-gray-900/40 md:max-w-[360px]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-gray-800/40"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2 min-w-0">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-3.5 w-3.5 flex-shrink-0 text-gray-500"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
          </svg>
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
            Data Source
          </span>
          <span className="text-[10px] font-mono text-gray-500 truncate">
            · refreshed {teaser}
          </span>
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-3.5 w-3.5 flex-shrink-0 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-gray-800 px-3 py-2 space-y-1.5">
          {error && (
            <p className="text-[11px] text-red-300/80">
              Parquet metadata unavailable: {error}
            </p>
          )}
          {!error && !meta && (
            <p className="text-[11px] text-gray-500">
              Loading parquet metadata&hellip;
            </p>
          )}
          {meta && (
            <>
              <Field
                label="Source"
                value={`Azure Blob · ${meta.blobPath}`}
                title={`Container: ${meta.container}`}
              />
              <Field
                label="Refreshed on Azure"
                value={fmtAbs(meta.lastModifiedUtc)}
                sub={fmtRelative(meta.lastModifiedUtc)}
              />
              <Field
                label="Downloaded to server"
                value={
                  meta.downloadedAtUtc
                    ? fmtAbs(meta.downloadedAtUtc)
                    : "not cached"
                }
                sub={
                  meta.downloadedAtUtc
                    ? `${fmtRelative(meta.downloadedAtUtc)} · expires ${fmtAbs(meta.cacheExpiresAtUtc)}`
                    : "server cache is cold — next request will download"
                }
                tone={meta.downloadedAtUtc ? "ok" : "warn"}
              />
              <Field label="Size" value={fmtBytes(meta.contentLengthBytes)} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
