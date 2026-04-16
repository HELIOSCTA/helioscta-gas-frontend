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

## Do not

- Do not accept arbitrary `container` / `blobPath` values from the client. The
  `/api/parquet-meta` endpoint is keyed by dataset name on purpose.
- Do not bypass `readParquet` in `lib/azure-parquet.ts` — its cache is what the
  "Downloaded" field reports on.
