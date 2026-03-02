from datetime import date, datetime
from typing import Optional, List
import io
import base64

import pandas as pd
import plotly.graph_objects as go
import plotly.io as pio
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from src.utils import azure_postgresql
from azure.storage.blob import BlobServiceClient

import os
import logging
logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="Helios CTA - Gas EBBs API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

PIPELINES = [
    {"id": "algonquin", "display_name": "Algonquin Gas Transmission", "table": "algonquin_critical_notices"},
    {"id": "anr", "display_name": "ANR Pipeline", "table": "anr_critical_notices"},
    {"id": "columbia_gas", "display_name": "Columbia Gas Transmission", "table": "columbia_gas_critical_notices"},
    {"id": "el_paso", "display_name": "El Paso Natural Gas", "table": "el_paso_critical_notices"},
    {"id": "florida_gas", "display_name": "Florida Gas Transmission", "table": "florida_gas_critical_notices"},
    {"id": "gulf_south", "display_name": "Gulf South Pipeline", "table": "gulf_south_critical_notices"},
    {"id": "iroquois", "display_name": "Iroquois Gas Transmission", "table": "iroquois_critical_notices"},
    {"id": "millennium", "display_name": "Millennium Pipeline", "table": "millennium_critical_notices"},
    {"id": "mountain_valley", "display_name": "Mountain Valley Pipeline", "table": "mountain_valley_critical_notices"},
    {"id": "ngpl", "display_name": "Natural Gas Pipeline of America", "table": "ngpl_critical_notices"},
    {"id": "northern_natural", "display_name": "Northern Natural Gas", "table": "northern_natural_critical_notices"},
    {"id": "northwest", "display_name": "Northwest Pipeline", "table": "northwest_critical_notices"},
    {"id": "panhandle_eastern", "display_name": "Panhandle Eastern", "table": "panhandle_eastern_critical_notices"},
    {"id": "rex", "display_name": "Rockies Express Pipeline", "table": "rex_critical_notices"},
    {"id": "rover", "display_name": "Rover Pipeline", "table": "rover_critical_notices"},
    {"id": "southeast_supply", "display_name": "Southeast Supply Header", "table": "southeast_supply_critical_notices"},
    {"id": "southern_pines", "display_name": "Southern Pines Pipeline", "table": "southern_pines_critical_notices"},
    {"id": "texas_eastern", "display_name": "Texas Eastern Transmission", "table": "texas_eastern_critical_notices"},
    {"id": "tgp", "display_name": "Tennessee Gas Pipeline", "table": "tgp_critical_notices"},
    {"id": "transco", "display_name": "Transcontinental Gas Pipe Line", "table": "transco_critical_notices"},
]

VALID_PIPELINE_IDS = {p["id"] for p in PIPELINES}
PIPELINE_TABLE_MAP = {p["id"]: p["table"] for p in PIPELINES}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/gas-ebbs/pipelines")
def list_pipelines():
    """Return list of all pipelines with metadata."""
    results = []
    for p in PIPELINES:
        try:
            df = azure_postgresql.pull_from_db(
                f"SELECT COUNT(*) as count, MAX(scraped_at) as last_scraped FROM gas_ebbs.{p['table']}"
            )
            if df is not None and len(df) > 0:
                results.append({
                    **p,
                    "notice_count": int(df.iloc[0]["count"]),
                    "last_scraped": str(df.iloc[0]["last_scraped"]) if df.iloc[0]["last_scraped"] else None,
                })
            else:
                results.append({**p, "notice_count": 0, "last_scraped": None})
        except Exception:
            results.append({**p, "notice_count": 0, "last_scraped": None})
    return {"pipelines": results}


@app.get("/api/gas-ebbs/critical-notices")
def get_critical_notices(
    pipeline: str = Query(..., description="Pipeline ID"),
    notice_type: Optional[str] = Query(None, description="Filter by notice type"),
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    limit: int = Query(500, ge=1, le=5000),
    offset: int = Query(0, ge=0),
):
    """Query critical notices for a specific pipeline."""
    if pipeline not in VALID_PIPELINE_IDS:
        raise HTTPException(status_code=400, detail=f"Invalid pipeline: {pipeline}")

    table = PIPELINE_TABLE_MAP[pipeline]
    conditions = []
    params: dict = {}

    if notice_type:
        conditions.append("notice_type ILIKE %(notice_type)s")
        params["notice_type"] = f"%{notice_type}%"
    if start_date:
        conditions.append("posted_datetime >= %(start_date)s")
        params["start_date"] = start_date
    if end_date:
        conditions.append("posted_datetime <= %(end_date)s")
        params["end_date"] = end_date

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    # Table name is safe — validated against allow-list above
    count_query = f"SELECT COUNT(*) as total FROM gas_ebbs.{table} {where_clause}"
    data_query = f"""
        SELECT * FROM gas_ebbs.{table}
        {where_clause}
        ORDER BY posted_datetime DESC
        LIMIT %(limit)s OFFSET %(offset)s
    """
    params["limit"] = limit
    params["offset"] = offset

    try:
        count_df = azure_postgresql.pull_from_db(count_query, params=params if conditions else None)
        total = int(count_df.iloc[0]["total"]) if count_df is not None else 0

        df = azure_postgresql.pull_from_db(data_query, params=params)
        rows = df.to_dict(orient="records") if df is not None else []

        # Convert any Timestamp objects to strings
        for row in rows:
            for k, v in row.items():
                if isinstance(v, (datetime, date)):
                    row[k] = str(v)
                elif hasattr(v, 'isoformat'):
                    row[k] = v.isoformat()

        return {
            "pipeline": pipeline,
            "total_count": total,
            "rows": rows,
            "limit": limit,
            "offset": offset,
        }
    except Exception as e:
        logging.error(f"Error querying {table}: {e}")
        raise HTTPException(status_code=500, detail=f"Database query failed: {str(e)}")


@app.get("/api/gas-ebbs/dashboard")
def dashboard():
    """Aggregated dashboard statistics."""
    pipeline_stats = []
    recent_notices = []

    for p in PIPELINES:
        try:
            df = azure_postgresql.pull_from_db(
                f"SELECT COUNT(*) as count, MAX(scraped_at) as last_scraped FROM gas_ebbs.{p['table']}"
            )
            if df is not None and len(df) > 0:
                pipeline_stats.append({
                    "pipeline_id": p["id"],
                    "display_name": p["display_name"],
                    "notice_count": int(df.iloc[0]["count"]),
                    "last_scraped": str(df.iloc[0]["last_scraped"]) if df.iloc[0]["last_scraped"] else None,
                })
        except Exception:
            pipeline_stats.append({
                "pipeline_id": p["id"],
                "display_name": p["display_name"],
                "notice_count": 0,
                "last_scraped": None,
            })

    # Get recent notices across all pipelines
    union_parts = []
    for p in PIPELINES:
        union_parts.append(
            f"SELECT '{p['id']}' as pipeline_id, '{p['display_name']}' as pipeline_name, "
            f"notice_type, posted_datetime, subject, notice_identifier "
            f"FROM gas_ebbs.{p['table']}"
        )
    union_query = " UNION ALL ".join(union_parts)
    recent_query = f"SELECT * FROM ({union_query}) combined ORDER BY posted_datetime DESC LIMIT 20"

    try:
        recent_df = azure_postgresql.pull_from_db(recent_query)
        if recent_df is not None:
            recent_notices = recent_df.to_dict(orient="records")
    except Exception as e:
        logging.warning(f"Failed to fetch recent notices: {e}")

    total_notices = sum(s["notice_count"] for s in pipeline_stats)

    return {
        "total_notices": total_notices,
        "pipeline_count": len(PIPELINES),
        "pipeline_stats": pipeline_stats,
        "recent_notices": recent_notices,
    }


@app.get("/api/gas-ebbs/scraper-status")
def scraper_status():
    """Get scraper health status for each pipeline."""
    results = []
    for p in PIPELINES:
        try:
            df = azure_postgresql.pull_from_db(
                f"SELECT COUNT(*) as count, MAX(scraped_at) as last_scraped, MAX(updated_at) as last_updated FROM gas_ebbs.{p['table']}"
            )
            if df is not None and len(df) > 0:
                last_scraped = df.iloc[0]["last_scraped"]
                results.append({
                    "pipeline_id": p["id"],
                    "display_name": p["display_name"],
                    "row_count": int(df.iloc[0]["count"]),
                    "last_scraped": str(last_scraped) if last_scraped else None,
                    "last_updated": str(df.iloc[0]["last_updated"]) if df.iloc[0]["last_updated"] else None,
                })
            else:
                results.append({
                    "pipeline_id": p["id"],
                    "display_name": p["display_name"],
                    "row_count": 0,
                    "last_scraped": None,
                    "last_updated": None,
                })
        except Exception:
            results.append({
                "pipeline_id": p["id"],
                "display_name": p["display_name"],
                "row_count": 0,
                "last_scraped": None,
                "last_updated": None,
            })
    return {"scrapers": results}


# ── Workspace Plot Generation ────────────────────────────────────────────────

def _get_blob_container():
    conn_str = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
    container_name = os.getenv("AZURE_STORAGE_CONTAINER_NAME", "helioscta-workspaces")
    if not conn_str:
        raise HTTPException(status_code=500, detail="AZURE_STORAGE_CONNECTION_STRING not set")
    client = BlobServiceClient.from_connection_string(conn_str)
    return client.get_container_client(container_name)


def _read_csv_from_blob(blob_path: str) -> pd.DataFrame:
    container = _get_blob_container()
    blob_client = container.get_blob_client(blob_path)
    data = blob_client.download_blob().readall()
    return pd.read_csv(io.BytesIO(data))


class PlotRequest(BaseModel):
    blob_path: str
    x_column: str
    y_columns: List[str]
    chart_type: str = "line"       # line, bar, scatter
    title: str = "Chart"
    output_blob_path: Optional[str] = None  # if set, saves PNG to blob


@app.post("/api/workspace/plot")
def generate_plot(req: PlotRequest):
    """Read CSV from blob, generate matplotlib chart, return PNG + Recharts JSON."""
    try:
        df = _read_csv_from_blob(req.blob_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read CSV: {e}")

    # Validate columns
    missing = [c for c in [req.x_column] + req.y_columns if c not in df.columns]
    if missing:
        raise HTTPException(status_code=400, detail=f"Columns not found: {missing}. Available: {list(df.columns)}")

    # Generate Plotly chart
    fig = go.Figure()
    colors = ["#06b6d4", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#ec4899"]

    for i, col in enumerate(req.y_columns):
        color = colors[i % len(colors)]
        if req.chart_type == "bar":
            fig.add_trace(go.Bar(x=df[req.x_column], y=df[col], name=col, marker_color=color, opacity=0.8))
        elif req.chart_type == "scatter":
            fig.add_trace(go.Scatter(x=df[req.x_column], y=df[col], name=col, mode="markers", marker=dict(color=color, size=6)))
        else:
            fig.add_trace(go.Scatter(x=df[req.x_column], y=df[col], name=col, mode="lines", line=dict(color=color, width=1.5)))

    fig.update_layout(
        title=dict(text=req.title, font=dict(color="#e5e7eb")),
        xaxis=dict(title=req.x_column, color="#9ca3af", gridcolor="#1f2937"),
        yaxis=dict(color="#9ca3af", gridcolor="#1f2937"),
        plot_bgcolor="#12141d",
        paper_bgcolor="#0f1117",
        legend=dict(font=dict(color="#e5e7eb"), bgcolor="#12141d", bordercolor="#374151"),
        margin=dict(l=60, r=30, t=50, b=80),
    )

    # Export to PNG bytes
    png_bytes = pio.to_image(fig, format="png", width=1000, height=600, scale=2)
    png_b64 = base64.b64encode(png_bytes).decode()

    # Export Plotly JSON for interactive rendering on frontend
    plotly_json = fig.to_json()

    # Optionally save PNG to blob
    if req.output_blob_path:
        try:
            container = _get_blob_container()
            blob_client = container.get_blob_client(req.output_blob_path)
            blob_client.upload_blob(png_bytes, overwrite=True, content_settings={"content_type": "image/png"})
        except Exception as e:
            logging.warning(f"Failed to save plot to blob: {e}")

    # Build Recharts-compatible JSON data
    recharts_data = []
    for _, row in df.iterrows():
        point = {req.x_column: row[req.x_column]}
        for col in req.y_columns:
            val = row[col]
            if pd.notna(val):
                point[col] = float(val) if isinstance(val, (int, float)) else val
        recharts_data.append(point)

    return {
        "image_base64": png_b64,
        "plotly_json": plotly_json,
        "recharts_data": recharts_data,
        "x_key": req.x_column,
        "y_keys": req.y_columns,
    }


@app.get("/api/workspace/plot-data")
def get_plot_data(
    blob_path: str = Query(..., description="Blob path to CSV file"),
):
    """Read CSV from blob and return structured JSON for Recharts (no image)."""
    try:
        df = _read_csv_from_blob(blob_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read CSV: {e}")

    columns = list(df.columns)
    data = []
    for _, row in df.iterrows():
        point = {}
        for col in columns:
            val = row[col]
            if pd.notna(val):
                point[col] = float(val) if isinstance(val, (int, float)) else str(val)
        data.append(point)

    return {
        "columns": columns,
        "data": data,
        "row_count": len(data),
    }
