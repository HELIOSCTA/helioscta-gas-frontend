#!/bin/bash
# =============================================================================
# Azure Blob Storage Setup for Workspace Feature
# Creates: Storage Account + Blob Container (helioscta-workspaces)
# Outputs the connection string to add to frontend/.env.local
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Load .env file if it exists (scripts/.env)
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ -f "$SCRIPT_DIR/.env" ]]; then
    echo "Loading credentials from $SCRIPT_DIR/.env"
    set -a
    source "$SCRIPT_DIR/.env"
    set +a
fi

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
RESOURCE_GROUP="helioscta-rg"
LOCATION="westus"
STORAGE_ACCOUNT_NAME="${STORAGE_ACCOUNT_NAME:-heliosctastorage}"
CONTAINER_NAME="${AZURE_STORAGE_CONTAINER_NAME:-helioscta-workspaces}"
STORAGE_SKU="Standard_LRS"

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
echo "=== Pre-flight checks ==="

if ! command -v az &> /dev/null; then
    echo "ERROR: Azure CLI (az) is not installed. Install from https://aka.ms/installazurecli"
    exit 1
fi

# Ensure logged in
echo "Checking Azure login..."
az account show > /dev/null 2>&1 || az login

echo "Using subscription: $(az account show --query name -o tsv)"
echo ""

# ---------------------------------------------------------------------------
# Step 1: Ensure Resource Group exists
# ---------------------------------------------------------------------------
echo "=== Step 1: Resource Group ==="
if az group show --name "$RESOURCE_GROUP" &> /dev/null; then
    echo "Resource group '$RESOURCE_GROUP' already exists."
else
    echo "Creating resource group '$RESOURCE_GROUP' in '$LOCATION'..."
    az group create --name "$RESOURCE_GROUP" --location "$LOCATION"
fi
echo ""

# ---------------------------------------------------------------------------
# Step 2: Create Storage Account
# ---------------------------------------------------------------------------
echo "=== Step 2: Storage Account ==="
if az storage account show --name "$STORAGE_ACCOUNT_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
    echo "Storage account '$STORAGE_ACCOUNT_NAME' already exists. Skipping."
else
    echo "Creating storage account '$STORAGE_ACCOUNT_NAME' (SKU: $STORAGE_SKU)..."
    az storage account create \
        --name "$STORAGE_ACCOUNT_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --location "$LOCATION" \
        --sku "$STORAGE_SKU" \
        --kind StorageV2 \
        --min-tls-version TLS1_2 \
        --allow-blob-public-access false
fi
echo ""

# ---------------------------------------------------------------------------
# Step 3: Get Connection String
# ---------------------------------------------------------------------------
echo "=== Step 3: Fetching Connection String ==="
CONNECTION_STRING=$(az storage account show-connection-string \
    --name "$STORAGE_ACCOUNT_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query connectionString \
    -o tsv)

if [[ -z "$CONNECTION_STRING" ]]; then
    echo "ERROR: Failed to retrieve connection string."
    exit 1
fi
echo "Connection string retrieved."
echo ""

# ---------------------------------------------------------------------------
# Step 4: Create Blob Container
# ---------------------------------------------------------------------------
echo "=== Step 4: Blob Container ==="
if az storage container show \
    --name "$CONTAINER_NAME" \
    --connection-string "$CONNECTION_STRING" &> /dev/null; then
    echo "Container '$CONTAINER_NAME' already exists. Skipping."
else
    echo "Creating blob container '$CONTAINER_NAME'..."
    az storage container create \
        --name "$CONTAINER_NAME" \
        --connection-string "$CONNECTION_STRING" \
        --public-access off
fi
echo ""

# ---------------------------------------------------------------------------
# Step 5: Set CORS rules (allow frontend to access blobs if needed)
# ---------------------------------------------------------------------------
echo "=== Step 5: CORS Rules ==="
echo "Setting CORS rules for blob service..."
az storage cors add \
    --services b \
    --methods GET PUT OPTIONS \
    --origins "*" \
    --allowed-headers "*" \
    --exposed-headers "*" \
    --max-age 3600 \
    --connection-string "$CONNECTION_STRING" 2>/dev/null || true
echo "CORS rules configured."
echo ""

# ---------------------------------------------------------------------------
# Step 6: Run Database Migration
# ---------------------------------------------------------------------------
echo "=== Step 6: Database Migration ==="
MIGRATION_FILE="$SCRIPT_DIR/../backend/migrations/003_workspace_tables.sql"
if [[ -f "$MIGRATION_FILE" ]]; then
    echo "Found migration: $MIGRATION_FILE"
    if [[ -n "${AZURE_POSTGRESQL_DB_HOST:-}" && "${AZURE_POSTGRESQL_DB_USER:-}" != "REPLACE_ME" ]]; then
        read -rp "Run workspace tables migration against the database? (y/N): " run_migration
        if [[ "$run_migration" =~ ^[Yy]$ ]]; then
            echo "Running migration..."
            PGPASSWORD="$AZURE_POSTGRESQL_DB_PASSWORD" psql \
                -h "$AZURE_POSTGRESQL_DB_HOST" \
                -p "${AZURE_POSTGRESQL_DB_PORT:-5432}" \
                -U "$AZURE_POSTGRESQL_DB_USER" \
                -d "${AZURE_POSTGRESQL_DB_NAME:-helioscta}" \
                -f "$MIGRATION_FILE"
            echo "Migration complete."
        else
            echo "Skipped. Run manually:"
            echo "  psql -h $AZURE_POSTGRESQL_DB_HOST -U $AZURE_POSTGRESQL_DB_USER -d ${AZURE_POSTGRESQL_DB_NAME:-helioscta} -f $MIGRATION_FILE"
        fi
    else
        echo "Database credentials not set. Run migration manually:"
        echo "  psql -h <host> -U <user> -d <db> -f $MIGRATION_FILE"
    fi
else
    echo "Migration file not found at $MIGRATION_FILE. Skipping."
fi
echo ""

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo "============================================="
echo "  Workspace Blob Storage Setup Complete!"
echo "============================================="
echo ""
echo "  Storage Account:  $STORAGE_ACCOUNT_NAME"
echo "  Container:        $CONTAINER_NAME"
echo "  Resource Group:   $RESOURCE_GROUP"
echo "  Location:         $LOCATION"
echo ""
echo "  Add these to frontend/.env.local:"
echo ""
echo "    AZURE_STORAGE_CONNECTION_STRING=$CONNECTION_STRING"
echo "    AZURE_STORAGE_CONTAINER_NAME=$CONTAINER_NAME"
echo ""
echo "  Add to Vercel environment variables:"
echo "    AZURE_STORAGE_CONNECTION_STRING  (same value)"
echo "    AZURE_STORAGE_CONTAINER_NAME     (same value)"
echo ""
echo "============================================="
