"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import MultiSelect from "@/components/ui/MultiSelect";
import {
  extractLocationIds,
  ExtractionError,
} from "@/lib/extract-location-ids";

/* ------------------------------------------------------------------ */
/*  sessionStorage cache helpers                                       */
/* ------------------------------------------------------------------ */

const CACHE_PREFIX = "genscape-filters:";

function cacheGet<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function cacheSet(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value));
  } catch {
    // sessionStorage full or unavailable — silently skip
  }
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface WatchlistRow {
  watchlist_id: number;
  slug: string;
  display_name: string;
  location_role_ids: number[];
  created_at: string;
}

interface LassoPreviewRow {
  pipelineShortName: string;
  locationName: string;
  locationId: number;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function WatchlistEditor() {
  const [watchlists, setWatchlists] = useState<WatchlistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | "new" | null>(null);

  // Form state
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lasso import state
  const [showLassoImport, setShowLassoImport] = useState(false);
  const [lassoText, setLassoText] = useState("");
  const [lassoError, setLassoError] = useState<string | null>(null);
  const [lassoPreview, setLassoPreview] = useState<LassoPreviewRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cascading filter state
  const [allPipelines, setAllPipelines] = useState<string[]>([]);
  const [selectedPipelines, setSelectedPipelines] = useState<string[]>([]);
  const [availableLocNames, setAvailableLocNames] = useState<string[]>([]);
  const [selectedLocNames, setSelectedLocNames] = useState<string[]>([]);
  const [availableRoleIds, setAvailableRoleIds] = useState<string[]>([]);
  const [allRoleIdsForPipelines, setAllRoleIdsForPipelines] = useState<string[]>([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [filterLoading, setFilterLoading] = useState(false);

  /* ---- Fetch watchlists ---- */
  const fetchWatchlists = useCallback(async () => {
    try {
      const res = await fetch("/api/watchlists");
      const data = await res.json();
      setWatchlists(data.watchlists ?? []);
    } catch (err) {
      console.error("Failed to fetch watchlists:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWatchlists();
  }, [fetchWatchlists]);

  /* ---- Fetch all pipelines on mount ---- */
  useEffect(() => {
    const cached = cacheGet<string[]>("pipeline-list");
    if (cached) {
      setAllPipelines(cached);
      return;
    }

    fetch("/api/genscape-noms/filters")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const pipelines: string[] = data.pipelines ?? [];
        setAllPipelines(pipelines);
        cacheSet("pipeline-list", pipelines);
      })
      .catch(() => {});
  }, []);

  /* ---- Cascade: pipelines → loc names + role IDs ---- */
  useEffect(() => {
    if (selectedPipelines.length === 0) {
      setAvailableLocNames([]);
      setAllRoleIdsForPipelines([]);
      setAvailableRoleIds([]);
      // Don't clear selectedRoleIds — they accumulate across pipeline browsing
      return;
    }

    const cacheKey = [...selectedPipelines].sort().join(",");
    const cached = cacheGet<{ loc_names: string[]; role_ids: string[] }>(cacheKey);
    if (cached) {
      setAvailableLocNames(cached.loc_names);
      setAllRoleIdsForPipelines(cached.role_ids);
      setAvailableRoleIds(cached.role_ids);
      return;
    }

    setFilterLoading(true);
    const params = new URLSearchParams({
      pipelines: selectedPipelines.join(","),
    });
    fetch(`/api/genscape-noms/filters?${params}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const newLocNames: string[] = data.loc_names ?? [];
        const newRoleIds: string[] = (data.location_role_ids ?? []).map(String);

        cacheSet(cacheKey, { loc_names: newLocNames, role_ids: newRoleIds });

        setAvailableLocNames(newLocNames);
        setAllRoleIdsForPipelines(newRoleIds);
        setAvailableRoleIds(newRoleIds);
      })
      .catch(() => {})
      .finally(() => setFilterLoading(false));
  }, [selectedPipelines]);

  /* ---- Cascade: loc names → refine role IDs ---- */
  useEffect(() => {
    if (selectedPipelines.length === 0) return;

    if (selectedLocNames.length === 0) {
      setAvailableRoleIds(allRoleIdsForPipelines);
      return;
    }

    const sortedPipelines = [...selectedPipelines].sort().join(",");
    const sortedLocNames = [...selectedLocNames].sort().join(",");
    const cacheKey = `${sortedPipelines}|${sortedLocNames}`;
    const cached = cacheGet<string[]>(cacheKey);
    if (cached) {
      setAvailableRoleIds(cached);
      return;
    }

    setFilterLoading(true);
    const params = new URLSearchParams({
      pipelines: selectedPipelines.join(","),
      locNames: selectedLocNames.join(","),
    });
    fetch(`/api/genscape-noms/filters?${params}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const newRoleIds: string[] = (data.location_role_ids ?? []).map(String);
        cacheSet(cacheKey, newRoleIds);
        setAvailableRoleIds(newRoleIds);
      })
      .catch(() => {})
      .finally(() => setFilterLoading(false));
  }, [selectedLocNames, selectedPipelines, allRoleIdsForPipelines]);

  /* ---- Reset filter browse state ---- */
  const resetFilters = useCallback(() => {
    setSelectedPipelines([]);
    setSelectedLocNames([]);
    setAvailableLocNames([]);
    setAvailableRoleIds([]);
    setAllRoleIdsForPipelines([]);
    setSelectedRoleIds([]);
  }, []);

  /* ---- Select existing watchlist: load its filter context ---- */
  const handleSelect = useCallback((wl: WatchlistRow) => {
    setSelectedId(wl.watchlist_id);
    setEditName(wl.display_name);
    setError(null);
    setConfirmDelete(false);

    // Load filter context for the watchlist's role IDs
    const roleIdStrings = wl.location_role_ids.map(String);
    setSelectedRoleIds(roleIdStrings);

    setFilterLoading(true);
    const params = new URLSearchParams({
      locationRoleIds: wl.location_role_ids.join(","),
    });
    fetch(`/api/genscape-noms/filters?${params}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const pipelines: string[] = data.pipelines ?? [];
        const locNames: string[] = data.loc_names ?? [];
        const roleIds: string[] = (data.location_role_ids ?? []).map(String);

        setAllPipelines((prev) => {
          // Merge in any pipelines from this watchlist that aren't in the full list
          const merged = new Set([...prev, ...pipelines]);
          return Array.from(merged).sort();
        });
        setSelectedPipelines(pipelines);
        setAvailableLocNames(locNames);
        setSelectedLocNames([]);
        setAvailableRoleIds(roleIds);
        setAllRoleIdsForPipelines(roleIds);
      })
      .catch(() => {})
      .finally(() => setFilterLoading(false));
  }, []);

  // Lasso resolving state
  const [lassoResolving, setLassoResolving] = useState(false);

  /* ---- Lasso import ---- */
  const applyLassoText = useCallback(async (text: string) => {
    setLassoError(null);
    try {
      const { locationIds } = extractLocationIds(text);

      // Build preview rows from the raw parsed data
      try {
        const parsed = JSON.parse(text.trim());
        const items: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
        const seen = new Set<number>();
        const preview: LassoPreviewRow[] = [];
        for (const item of items) {
          if (item && typeof item === "object" && "locationId" in item) {
            const obj = item as Record<string, unknown>;
            const id = typeof obj.locationId === "number" ? obj.locationId
              : typeof obj.locationId === "string" ? parseInt(obj.locationId as string, 10)
              : NaN;
            if (Number.isInteger(id) && !seen.has(id)) {
              seen.add(id);
              preview.push({
                pipelineShortName: String(obj.pipelineShortName ?? obj.pipeline_short_name ?? "—"),
                locationName: String(obj.locationName ?? obj.loc_name ?? "—").trim(),
                locationId: id,
              });
            }
          }
        }
        setLassoPreview(preview);
      } catch {
        setLassoPreview([]);
      }

      // Resolve location_id → location_role_id via API
      setLassoResolving(true);
      setShowLassoImport(false);
      setLassoText("");
      try {
        const params = new URLSearchParams({
          locationIds: locationIds.join(","),
        });
        const res = await fetch(`/api/genscape-noms/filters?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        const roleIds: string[] = (data.location_role_ids ?? []).map(String);
        const pipelines: string[] = data.pipelines ?? [];
        const locNames: string[] = data.loc_names ?? [];

        if (roleIds.length === 0) {
          setLassoError(
            "No matching location role IDs found in the database for the imported location IDs."
          );
          setSelectedRoleIds([]);
        } else {
          setSelectedRoleIds(roleIds);
        }
        setSelectedPipelines(pipelines);
        setSelectedLocNames([]);
        setAvailableLocNames(locNames);
        setAvailableRoleIds(roleIds);
        setAllRoleIdsForPipelines(roleIds);
      } catch {
        setLassoError("Failed to resolve location IDs. Please try again.");
      } finally {
        setLassoResolving(false);
      }
    } catch (err) {
      if (err instanceof ExtractionError) {
        setLassoError(err.message);
      } else {
        setLassoError("Unexpected error processing input.");
      }
      setLassoPreview([]);
    }
  }, []);

  const handleLassoImport = useCallback(() => {
    applyLassoText(lassoText);
  }, [lassoText, applyLassoText]);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        setLassoText(text);
        applyLassoText(text);
      };
      reader.onerror = () => {
        setLassoError("Failed to read file.");
      };
      reader.readAsText(file);
      // Reset input so the same file can be re-selected
      e.target.value = "";
    },
    [applyLassoText]
  );

  /* ---- New watchlist ---- */
  const handleNew = useCallback(() => {
    setSelectedId("new");
    setEditName("");
    setError(null);
    setConfirmDelete(false);
    setShowLassoImport(false);
    setLassoText("");
    setLassoError(null);
    setLassoPreview([]);
    resetFilters();
  }, [resetFilters]);

  /* ---- Cancel ---- */
  const handleCancel = useCallback(() => {
    setSelectedId(null);
    setEditName("");
    setError(null);
    setConfirmDelete(false);
    setShowLassoImport(false);
    setLassoText("");
    setLassoError(null);
    setLassoPreview([]);
    resetFilters();
  }, [resetFilters]);

  /* ---- Save ---- */
  const handleSave = async () => {
    setError(null);
    const name = editName.trim();
    if (!name) {
      setError("Name is required.");
      return;
    }
    if (selectedRoleIds.length === 0) {
      setError("Select at least one location role ID.");
      return;
    }

    const ids = selectedRoleIds.map(Number).filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) {
      setError("No valid role IDs selected.");
      return;
    }

    setSaving(true);
    try {
      if (selectedId === "new") {
        const res = await fetch("/api/watchlists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, locationRoleIds: ids }),
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error ?? "Failed to create watchlist.");
          return;
        }
      } else {
        const res = await fetch(`/api/watchlists/${selectedId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, locationRoleIds: ids }),
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error ?? "Failed to update watchlist.");
          return;
        }
      }
      setSelectedId(null);
      resetFilters();
      await fetchWatchlists();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  /* ---- Delete ---- */
  const handleDelete = async () => {
    if (typeof selectedId !== "number") return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/watchlists/${selectedId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to delete watchlist.");
        return;
      }
      setSelectedId(null);
      resetFilters();
      await fetchWatchlists();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const selectedWatchlist =
    typeof selectedId === "number"
      ? watchlists.find((wl) => wl.watchlist_id === selectedId) ?? null
      : null;

  if (loading) {
    return <p className="text-sm text-gray-500">Loading watchlists...</p>;
  }

  return (
    <div className="flex gap-6">
      {/* Left Panel — Watchlist list */}
      <div className="w-80 flex-shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-300">Watchlists</h3>
          <button
            onClick={handleNew}
            className="flex items-center gap-1.5 rounded-lg border border-dashed border-gray-700 bg-gray-900/30 px-3 py-1.5 text-gray-500 transition-colors hover:border-gray-500 hover:bg-gray-800/40 hover:text-gray-300"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-xs font-medium">New Watchlist</span>
          </button>
        </div>

        {watchlists.length === 0 && (
          <p className="text-sm text-gray-600">No watchlists yet. Create one to get started.</p>
        )}

        {watchlists.map((wl) => {
          const isActive = selectedId === wl.watchlist_id;
          return (
            <button
              key={wl.watchlist_id}
              onClick={() => handleSelect(wl)}
              className={`w-full rounded-lg border p-4 text-left transition-colors ${
                isActive
                  ? "border-purple-500/50 bg-purple-500/5"
                  : "border-gray-800 bg-gray-900/60 hover:border-gray-600 hover:bg-gray-800/60"
              }`}
            >
              <p className="text-sm font-medium text-gray-200">{wl.display_name}</p>
              <p className="mt-1 text-[11px] text-gray-500">
                {wl.location_role_ids.length} location role ID{wl.location_role_ids.length !== 1 ? "s" : ""}
              </p>
            </button>
          );
        })}
      </div>

      {/* Right Panel — Edit form with cascading filters */}
      <div className="flex-1">
        {selectedId === null ? (
          <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-gray-800">
            <p className="text-sm text-gray-600">Select a watchlist to edit, or create a new one.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-6">
            <h3 className="mb-4 text-sm font-semibold text-gray-200">
              {selectedId === "new" ? "New Watchlist" : `Edit: ${selectedWatchlist?.display_name ?? ""}`}
            </h3>

            {error && (
              <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">Name</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. KRS Watchlist"
                  className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-gray-500 focus:outline-none"
                />
              </div>

              {/* Lasso Import */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowLassoImport((prev) => !prev);
                    setLassoError(null);
                  }}
                  className="flex items-center gap-1.5 text-xs font-medium text-purple-400 transition-colors hover:text-purple-300"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  {showLassoImport ? "Hide Lasso Import" : "Import from Lasso"}
                </button>

                {showLassoImport && (
                  <div className="space-y-3 rounded-lg border border-gray-800 bg-[#0f1117] p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                      Import Lasso Output
                    </p>
                    <p className="text-[11px] text-gray-500">
                      Upload a JSON/YAML file or paste the response captured from DevTools.
                    </p>

                    {/* File upload */}
                    <div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json,.yaml,.yml,.txt"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1.5 rounded border border-gray-700 bg-gray-800 px-3 py-2 text-xs text-gray-300 transition-colors hover:border-gray-500 hover:bg-gray-700"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M6 20h12a2 2 0 002-2V8l-6-6H6a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        Choose File
                      </button>
                    </div>

                    {/* Divider */}
                    <div className="flex items-center gap-2">
                      <div className="h-px flex-1 bg-gray-800" />
                      <span className="text-[10px] text-gray-600">or paste below</span>
                      <div className="h-px flex-1 bg-gray-800" />
                    </div>

                    {/* Paste area */}
                    <textarea
                      value={lassoText}
                      onChange={(e) => {
                        setLassoText(e.target.value);
                        setLassoError(null);
                      }}
                      placeholder='[{"locationId": 442494, ...}, ...]'
                      rows={5}
                      className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 font-mono text-xs text-gray-200 placeholder-gray-600 focus:border-gray-500 focus:outline-none"
                    />
                    {lassoError && (
                      <p className="text-xs text-red-400">{lassoError}</p>
                    )}
                    <button
                      type="button"
                      onClick={handleLassoImport}
                      disabled={!lassoText.trim()}
                      className="rounded bg-purple-600/80 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
                    >
                      Extract IDs
                    </button>
                  </div>
                )}
              </div>

              {/* Lasso Import Preview */}
              {lassoResolving && (
                <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 px-4 py-3">
                  <p className="text-xs text-purple-400">Resolving location IDs...</p>
                </div>
              )}
              {lassoPreview.length > 0 && (
                <div className="space-y-2 rounded-lg border border-purple-500/30 bg-purple-500/5 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-purple-400">
                      Imported Locations ({lassoPreview.length}) — {selectedRoleIds.length} role ID{selectedRoleIds.length !== 1 ? "s" : ""} resolved
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setLassoPreview([]);
                        setSelectedRoleIds([]);
                        setAvailableRoleIds([]);
                        setAllRoleIdsForPipelines([]);
                      }}
                      className="text-[10px] text-gray-500 hover:text-gray-300"
                    >
                      Clear
                    </button>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-800 text-left text-[10px] uppercase tracking-wider text-gray-500">
                        <th className="pb-1.5 pr-3">Pipeline</th>
                        <th className="pb-1.5 pr-3">Location Name</th>
                        <th className="pb-1.5">Location ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lassoPreview.map((row) => (
                        <tr key={row.locationId} className="border-b border-gray-800/50">
                          <td className="py-1.5 pr-3 text-gray-300">{row.pipelineShortName}</td>
                          <td className="py-1.5 pr-3 text-gray-300">{row.locationName}</td>
                          <td className="py-1.5 font-mono text-gray-400">{row.locationId}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Cascading Filters */}
              <div className="space-y-3 rounded-lg border border-gray-800 bg-[#0f1117] p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Browse Locations
                </p>

                <div className="flex flex-wrap items-end gap-4">
                  <MultiSelect
                    label="Pipeline"
                    options={allPipelines}
                    selected={selectedPipelines}
                    onChange={setSelectedPipelines}
                    placeholder="Select pipeline..."
                    width="w-64"
                  />
                </div>

                {selectedPipelines.length > 0 && (
                  <div className="flex flex-wrap items-end gap-4 pt-2 border-t border-gray-800">
                    {filterLoading && availableLocNames.length === 0 ? (
                      <p className="text-xs text-gray-500 py-1.5">Loading filter options...</p>
                    ) : (
                      <>
                        <MultiSelect
                          label="Location Name"
                          options={availableLocNames}
                          selected={selectedLocNames}
                          onChange={setSelectedLocNames}
                          placeholder="All locations..."
                          width="w-64"
                        />
                        <div className="relative">
                          <MultiSelect
                            label="Location Role ID"
                            options={availableRoleIds}
                            selected={selectedRoleIds}
                            onChange={setSelectedRoleIds}
                            placeholder="Select role IDs..."
                            width="w-56"
                          />
                          {filterLoading && (
                            <p className="absolute -bottom-5 left-0 text-[10px] text-gray-500">
                              Updating...
                            </p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Selected summary */}
              <p className="text-xs text-gray-500">
                {selectedRoleIds.length > 0
                  ? `${selectedRoleIds.length} role ID${selectedRoleIds.length !== 1 ? "s" : ""} selected`
                  : "No role IDs selected"}
              </p>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
                >
                  {saving ? "Saving..." : selectedId === "new" ? "Create" : "Save Changes"}
                </button>
                <button
                  onClick={handleCancel}
                  className="rounded px-4 py-2 text-sm text-gray-500 transition-colors hover:text-gray-300"
                >
                  Cancel
                </button>

                {typeof selectedId === "number" && (
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className={`ml-auto rounded px-4 py-2 text-sm font-medium transition-colors ${
                      confirmDelete
                        ? "bg-red-600 text-white hover:bg-red-500"
                        : "text-red-400 hover:bg-red-500/10 hover:text-red-300"
                    } disabled:opacity-50`}
                  >
                    {deleting ? "Deleting..." : confirmDelete ? "Confirm Delete" : "Delete"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
