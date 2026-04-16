/**
 * Central registry of Parquet datasets served from Azure Blob Storage.
 *
 * Keeping this in one place lets the shared `/api/parquet-meta` endpoint
 * and the `ParquetMetaStrip` UI component reference datasets by key,
 * without accepting arbitrary blob paths from the client.
 */

const DEFAULT_CONTAINER = process.env.AZURE_CONTAINER_NAME ?? "helioscta";

export const PARQUET_DATASETS = {
  "pjm-load-forecast": {
    container: DEFAULT_CONTAINER,
    blobPath: "pjm_cleaned/pjm_load_forecast_hourly.parquet",
    label: "PJM Load Forecast",
  },
  "pjm-lmps": {
    container: DEFAULT_CONTAINER,
    blobPath: "pjm_cleaned/pjm_lmps_hourly.parquet",
    label: "PJM LMP Prices",
  },
} as const;

export type ParquetDatasetKey = keyof typeof PARQUET_DATASETS;

export function isParquetDatasetKey(v: string | null): v is ParquetDatasetKey {
  return v != null && v in PARQUET_DATASETS;
}
