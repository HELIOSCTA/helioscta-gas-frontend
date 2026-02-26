from datetime import date, datetime
from typing import Optional, List

import pandas as pd
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from src.utils import azure_postgresql

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

    if notice_type:
        conditions.append(f"notice_type ILIKE '%{notice_type}%'")
    if start_date:
        conditions.append(f"posted_datetime >= '{start_date}'")
    if end_date:
        conditions.append(f"posted_datetime <= '{end_date}'")

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    count_query = f"SELECT COUNT(*) as total FROM gas_ebbs.{table} {where_clause}"
    data_query = f"""
        SELECT * FROM gas_ebbs.{table}
        {where_clause}
        ORDER BY posted_datetime DESC
        LIMIT {limit} OFFSET {offset}
    """

    try:
        count_df = azure_postgresql.pull_from_db(count_query)
        total = int(count_df.iloc[0]["total"]) if count_df is not None else 0

        df = azure_postgresql.pull_from_db(data_query)
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
