#!/bin/bash
# =============================================================================
# Azure Resource Setup for helioscta-gas-frontend Backend
# Creates: Resource Group, Container Registry, Container Apps Environment,
#          and deploys the backend container.
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
# Configuration — edit these before running
# ---------------------------------------------------------------------------
RESOURCE_GROUP="helioscta-rg"
LOCATION="westus"

# Azure Container Registry
ACR_NAME="heliosctaacr"

# Container Apps
CONTAINER_APP_ENV="gas-backend-env"
CONTAINER_APP_NAME="gas-backend"
IMAGE_NAME="gas-backend"
TARGET_PORT=1111

# Container resources
CPU="1.0"
MEMORY="2.0Gi"
MIN_REPLICAS=1
MAX_REPLICAS=5

# Database credentials — replace with real values or export as env vars before running
AZURE_POSTGRESQL_DB_HOST="${AZURE_POSTGRESQL_DB_HOST:-heliosctadb.postgres.database.azure.com}"
AZURE_POSTGRESQL_DB_PORT="${AZURE_POSTGRESQL_DB_PORT:-5432}"
AZURE_POSTGRESQL_DB_NAME="${AZURE_POSTGRESQL_DB_NAME:-helioscta}"
AZURE_POSTGRESQL_DB_USER="${AZURE_POSTGRESQL_DB_USER:-REPLACE_ME}"
AZURE_POSTGRESQL_DB_PASSWORD="${AZURE_POSTGRESQL_DB_PASSWORD:-REPLACE_ME}"

AZURE_SQL_DB_HOST="${AZURE_SQL_DB_HOST:-heliosazuresql.database.windows.net}"
AZURE_SQL_DB_PORT="${AZURE_SQL_DB_PORT:-1433}"
AZURE_SQL_DB_NAME="${AZURE_SQL_DB_NAME:-GenscapeDataFeed}"
AZURE_SQL_DB_USER="${AZURE_SQL_DB_USER:-REPLACE_ME}"
AZURE_SQL_DB_PASSWORD="${AZURE_SQL_DB_PASSWORD:-REPLACE_ME}"

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
echo "=== Pre-flight checks ==="

if ! command -v az &> /dev/null; then
    echo "ERROR: Azure CLI (az) is not installed. Install from https://aka.ms/installazurecli"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker is not installed."
    exit 1
fi

if [[ "$AZURE_POSTGRESQL_DB_USER" == "REPLACE_ME" || "$AZURE_SQL_DB_USER" == "REPLACE_ME" ]]; then
    echo "WARNING: Database credentials are not set."
    echo "  Export them as environment variables or edit this script before running."
    echo "  Example:"
    echo "    export AZURE_POSTGRESQL_DB_USER=myuser"
    echo "    export AZURE_POSTGRESQL_DB_PASSWORD=mypassword"
    echo "    export AZURE_SQL_DB_USER=myuser"
    echo "    export AZURE_SQL_DB_PASSWORD=mypassword"
    read -rp "Continue anyway? (y/N): " confirm
    [[ "$confirm" =~ ^[Yy]$ ]] || exit 1
fi

# Ensure logged in
echo "Checking Azure login..."
az account show > /dev/null 2>&1 || az login

echo "Using subscription: $(az account show --query name -o tsv)"
echo ""

# ---------------------------------------------------------------------------
# Step 1: Create Resource Group
# ---------------------------------------------------------------------------
echo "=== Step 1: Resource Group ==="
if az group show --name "$RESOURCE_GROUP" &> /dev/null; then
    echo "Resource group '$RESOURCE_GROUP' already exists. Skipping."
else
    echo "Creating resource group '$RESOURCE_GROUP' in '$LOCATION'..."
    az group create --name "$RESOURCE_GROUP" --location "$LOCATION"
fi
echo ""

# ---------------------------------------------------------------------------
# Step 2: Create Azure Container Registry
# ---------------------------------------------------------------------------
echo "=== Step 2: Azure Container Registry ==="
if az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
    echo "Container Registry '$ACR_NAME' already exists. Skipping."
else
    echo "Creating Container Registry '$ACR_NAME'..."
    az acr create \
        --resource-group "$RESOURCE_GROUP" \
        --name "$ACR_NAME" \
        --sku Basic \
        --admin-enabled true
fi

# Get ACR credentials (needed for GitHub Actions secrets)
echo "Fetching ACR credentials..."
ACR_USERNAME=$(az acr credential show --name "$ACR_NAME" --query username -o tsv)
ACR_PASSWORD=$(az acr credential show --name "$ACR_NAME" --query "passwords[0].value" -o tsv)
echo ""

# ---------------------------------------------------------------------------
# Step 3: Build and Push Docker Image
# ---------------------------------------------------------------------------
echo "=== Step 3: Build and Push Docker Image ==="
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Logging in to ACR..."
az acr login --name "$ACR_NAME"

echo "Building Docker image from $REPO_ROOT..."
docker build \
    -f "$REPO_ROOT/backend/Dockerfile" \
    -t "$ACR_NAME.azurecr.io/$IMAGE_NAME:latest" \
    "$REPO_ROOT"

echo "Pushing image to ACR..."
docker push "$ACR_NAME.azurecr.io/$IMAGE_NAME:latest"
echo ""

# ---------------------------------------------------------------------------
# Step 4: Create Container Apps Environment
# ---------------------------------------------------------------------------
echo "=== Step 4: Container Apps Environment ==="
if az containerapp env show --name "$CONTAINER_APP_ENV" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
    echo "Container Apps environment '$CONTAINER_APP_ENV' already exists. Skipping."
else
    echo "Creating Container Apps environment '$CONTAINER_APP_ENV'..."
    az containerapp env create \
        --name "$CONTAINER_APP_ENV" \
        --resource-group "$RESOURCE_GROUP" \
        --location "$LOCATION"
fi
echo ""

# ---------------------------------------------------------------------------
# Step 5: Deploy Container App
# ---------------------------------------------------------------------------
echo "=== Step 5: Deploy Container App ==="
if az containerapp show --name "$CONTAINER_APP_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
    echo "Container App '$CONTAINER_APP_NAME' already exists. Updating..."
    az containerapp update \
        --name "$CONTAINER_APP_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --image "$ACR_NAME.azurecr.io/$IMAGE_NAME:latest" \
        --set-env-vars \
            AZURE_POSTGRESQL_DB_HOST="$AZURE_POSTGRESQL_DB_HOST" \
            AZURE_POSTGRESQL_DB_PORT="$AZURE_POSTGRESQL_DB_PORT" \
            AZURE_POSTGRESQL_DB_NAME="$AZURE_POSTGRESQL_DB_NAME" \
            AZURE_POSTGRESQL_DB_USER="$AZURE_POSTGRESQL_DB_USER" \
            AZURE_POSTGRESQL_DB_PASSWORD="$AZURE_POSTGRESQL_DB_PASSWORD" \
            AZURE_SQL_DB_HOST="$AZURE_SQL_DB_HOST" \
            AZURE_SQL_DB_PORT="$AZURE_SQL_DB_PORT" \
            AZURE_SQL_DB_NAME="$AZURE_SQL_DB_NAME" \
            AZURE_SQL_DB_USER="$AZURE_SQL_DB_USER" \
            AZURE_SQL_DB_PASSWORD="$AZURE_SQL_DB_PASSWORD" \
            PYTHONUNBUFFERED="1"
else
    echo "Creating Container App '$CONTAINER_APP_NAME'..."
    az containerapp create \
        --name "$CONTAINER_APP_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --environment "$CONTAINER_APP_ENV" \
        --image "$ACR_NAME.azurecr.io/$IMAGE_NAME:latest" \
        --target-port "$TARGET_PORT" \
        --ingress external \
        --min-replicas "$MIN_REPLICAS" \
        --max-replicas "$MAX_REPLICAS" \
        --cpu "$CPU" \
        --memory "$MEMORY" \
        --registry-server "$ACR_NAME.azurecr.io" \
        --registry-username "$ACR_USERNAME" \
        --registry-password "$ACR_PASSWORD" \
        --env-vars \
            AZURE_POSTGRESQL_DB_HOST="$AZURE_POSTGRESQL_DB_HOST" \
            AZURE_POSTGRESQL_DB_PORT="$AZURE_POSTGRESQL_DB_PORT" \
            AZURE_POSTGRESQL_DB_NAME="$AZURE_POSTGRESQL_DB_NAME" \
            AZURE_POSTGRESQL_DB_USER="$AZURE_POSTGRESQL_DB_USER" \
            AZURE_POSTGRESQL_DB_PASSWORD="$AZURE_POSTGRESQL_DB_PASSWORD" \
            AZURE_SQL_DB_HOST="$AZURE_SQL_DB_HOST" \
            AZURE_SQL_DB_PORT="$AZURE_SQL_DB_PORT" \
            AZURE_SQL_DB_NAME="$AZURE_SQL_DB_NAME" \
            AZURE_SQL_DB_USER="$AZURE_SQL_DB_USER" \
            AZURE_SQL_DB_PASSWORD="$AZURE_SQL_DB_PASSWORD" \
            PYTHONUNBUFFERED="1"
fi
echo ""

# ---------------------------------------------------------------------------
# Step 6: Get Deployment Info
# ---------------------------------------------------------------------------
echo "=== Step 6: Deployment Info ==="
FQDN=$(az containerapp show \
    --name "$CONTAINER_APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query "properties.configuration.ingress.fqdn" \
    -o tsv)

echo ""
echo "============================================="
echo "  Deployment Complete!"
echo "============================================="
echo ""
echo "  Backend URL:  https://$FQDN"
echo "  Health Check: https://$FQDN/health"
echo ""
echo "  Set this in Vercel as PYTHON_API_URL:"
echo "    https://$FQDN"
echo ""
echo "  GitHub Actions Secrets (for CI/CD):"
echo "    ACR_USERNAME: $ACR_USERNAME"
echo "    ACR_PASSWORD: $ACR_PASSWORD"
echo ""
echo "============================================="
