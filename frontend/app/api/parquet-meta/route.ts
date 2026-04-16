import { NextResponse } from "next/server";
import { getParquetMeta, invalidateCache } from "@/lib/azure-parquet";
import {
  PARQUET_DATASETS,
  isParquetDatasetKey,
} from "@/lib/parquet-datasets";

export const dynamic = "force-dynamic";

/** Invalidate the server row-cache + blob-meta cache for a dataset. */
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const dataset = searchParams.get("dataset");

  if (!isParquetDatasetKey(dataset)) {
    return NextResponse.json(
      { error: "Unknown or missing dataset key" },
      { status: 400 }
    );
  }

  const { container, blobPath } = PARQUET_DATASETS[dataset];
  invalidateCache(container, blobPath);
  return NextResponse.json({ ok: true, dataset });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dataset = searchParams.get("dataset");

  if (!isParquetDatasetKey(dataset)) {
    return NextResponse.json(
      { error: "Unknown or missing dataset key" },
      { status: 400 }
    );
  }

  const { container, blobPath, label } = PARQUET_DATASETS[dataset];

  try {
    const meta = await getParquetMeta(container, blobPath);
    return NextResponse.json(
      { dataset, label, ...meta },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30",
        },
      }
    );
  } catch (error) {
    console.error("[parquet-meta] failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch parquet metadata" },
      { status: 500 }
    );
  }
}
