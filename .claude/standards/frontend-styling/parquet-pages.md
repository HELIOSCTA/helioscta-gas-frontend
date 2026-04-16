# Parquet-backed pages: standard

Any page whose data source is a Parquet file in Azure Blob Storage MUST render a
`ParquetMetaStrip` at the top of its client component so users can see when the
blob was last refreshed on Azure and when it was last downloaded by our server.

## How to add a new parquet-backed page

### 1. Register the dataset

Add an entry to `frontend/lib/parquet-datasets.ts`:

```ts
export const PARQUET_DATASETS = {
  // existing entries...
  "my-new-dataset": {
    container: DEFAULT_CONTAINER,
    blobPath: "path/to/your/file.parquet",
    label: "My New Dataset",
  },
} as const;
```

Keys are client-visible, so keep them URL-safe (lowercase, hyphenated).

### 2. Wire the section to the strip in the page header

The strip is rendered centrally by `HomePageClient.tsx` in the top-right of the
page header (not inside the feature component). Map the section to its dataset
key in `SECTION_PARQUET_DATASET`:

```ts
const SECTION_PARQUET_DATASET: Partial<Record<ActiveSection, ParquetDatasetKey>> = {
  // existing entries...
  "my-new-section": "my-new-dataset",
};
```

Do not render `ParquetMetaStrip` inside your feature component — it belongs in
the page header so all parquet-backed pages surface the metadata in the same
place. The strip ticks every 30s on its own.

## What the strip shows

- **Source** — container + blob path
- **Refreshed on Azure** — `lastModified` from `blobClient.getProperties()` (when the upstream ETL wrote the file)
- **Downloaded to server** — when our server last parsed the parquet into its in-process row cache (or "not cached" if cold)
- **Size** — blob content length

## Refresh control lives on the card

The **Refresh button lives inside the `ParquetMetaStrip` card header**, not in
the feature component's toolbar. Users expect the control for "clear the Azure
cache" to sit next to the data it describes.

Clicking Refresh:
1. `POST /api/parquet-meta?dataset=<key>` — invalidates the server-side
   row-cache and blob-meta-cache for that dataset.
2. Re-fetches the metadata so the card re-renders with fresh values.
3. Dispatches a `window` `CustomEvent("parquet:refresh", { detail: { dataset }})`
   — feature components listen for this and re-run their data fetches.

Feature components pick up the refresh with a tiny effect:

```tsx
import {
  PARQUET_REFRESH_EVENT,
  type ParquetRefreshDetail,
} from "@/components/ParquetMetaStrip";

useEffect(() => {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<ParquetRefreshDetail>).detail;
    if (detail?.dataset === "my-dataset") {
      // bump your fetch key, clear cached rows, or whatever triggers a refetch
      setCacheBust((n) => n + 1);
    }
  };
  window.addEventListener(PARQUET_REFRESH_EVENT, handler);
  return () => window.removeEventListener(PARQUET_REFRESH_EVENT, handler);
}, []);
```

Do NOT add a separate Refresh button to the page toolbar. One button, one
place — on the card.

## Do not

- Do not accept arbitrary `container` / `blobPath` values from the client. The
  `/api/parquet-meta` endpoint is keyed by dataset name on purpose.
- Do not bypass `readParquet` in `lib/azure-parquet.ts` — its cache is what the
  "Downloaded" field reports on.
- Do not add a Refresh button outside the `ParquetMetaStrip` card. If a page
  needs refresh-aware behavior, listen for `parquet:refresh` events instead.
