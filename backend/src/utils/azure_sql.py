import os

import pandas as pd
import pyodbc

# ignore warnings
import warnings
warnings.simplefilter(action='ignore', category=Warning)

# init logging
import logging
logging.basicConfig(level=logging.DEBUG)
logging.getLogger().handlers[0].setLevel(logging.DEBUG)

from src import (
    settings
)

"""
"""

def _connect_to_azure_sql(
        database: str = settings.AZURE_SQL_DB_NAME,
    ) -> pyodbc.Connection:
    """
    """
    connection = pyodbc.connect(
        f"Driver={{ODBC Driver 17 for SQL Server}};"
        f"Server={settings.AZURE_SQL_DB_HOST};"
        f"UID={settings.AZURE_SQL_DB_USER};"
        f"PWD={settings.AZURE_SQL_DB_PASSWORD};"
        f"Database={database};"
    )
    # logging.info(f"Connected to Azure SQL ... Database: {database}")

    return connection
    

def pull_from_db(
        query: str,
        database: str = settings.AZURE_SQL_DB_NAME,
    ) -> pd.DataFrame:

    try:
        with _connect_to_azure_sql(database=database) as connection:
        
            # logging.info(query)
            
            df = pd.read_sql(query, connection)
            logging.info(f"Pulled {len(df):,} rows ...")
            
            return df
    
    except pyodbc.Error as e:
        logging.error(f"Database error: {e}")
        raise
    except pd.errors.DatabaseError as e:
        logging.error(f"Pandas SQL error: {e}")
        raise
    except Exception as e:
        logging.error(f"Unexpected error: {e}")
        raise

"""
"""

if __name__ == "__main__":

    sql_query: str = """
SELECT TOP (1000) [gas_day]
    ,[pipeline_id]
    ,[pipeline_name]
    ,[pipeline_short_name]
    ,[tariff_zone]
    ,[tz_id]
    ,[state]
    ,[county]
    ,[loc_name]
    ,[location_id]
    ,[location_role_id]
    ,[facility]
    ,[role]
    ,[role_code]
    ,[interconnecting_entity]
    ,[interconnecting_pipeline_short_name]
    ,[meter]
    ,[drn]
    ,[latitude]
    ,[longitude]
    ,[sign]
    ,[cycle_code]
    ,[cycle_name]
    ,[units]
    ,[pipeline_balance_flag]
    ,[storage_flag]
    ,[scheduled_cap]
    ,[signed_scheduled_cap]
    ,[no_notice_capacity]
    ,[operational_cap]
    ,[available_cap]
    ,[design_cap]
FROM [noms_v1_2026_jan_02].[source_v1_genscape_noms]
    """

    df = pull_from_db(
        query=sql_query,
        database=settings.AZURE_SQL_DB_NAME,
    )