# Deployment Plan: helioscta-gas-frontend to Vercel

## 1. Architecture Overview

The deployed system consists of two independently hosted services:

```
                              Internet
                                 |
                         +-------+-------+
                         |               |
                   Vercel Edge       Azure Container Apps
                   (Frontend)           (Backend)
                   Next.js 15          FastAPI 3.12
                         |               |
              +----------+----------+    |
              |                     |    |
       Azure PostgreSQL        Azure SQL |
       (helioscta DB)      (GenscapeDataFeed)
       heliosctadb.             heliosazuresql.
       postgres.database.       database.windows.net
       azure.com                     |
              |                      |
              +----------+-----------+
                         |
                   Backend connects to
                   both databases
```

**Frontend (Vercel):** The Next.js 15 application runs on Vercel's edge/serverless infrastructure. All pages, components, and API routes (under `frontend/app/api/`) execute as Vercel Serverless Functions. The frontend connects to **two databases directly**:
- **Azure PostgreSQL** via the `pg` Node.js library (`lib/db.ts`) — used by backend-proxied API routes for gas pipeline critical notices.
- **Azure SQL (MSSQL)** via the `mssql`/`tedious` Node.js libraries (`lib/mssql.ts`) — used by `/api/genscape-noms` routes for Genscape nominations data.

API routes that need Python-powered analytics (e.g., scraper execution, heavy data processing) proxy requests to the FastAPI backend via the `PYTHON_API_URL` environment variable.

**Backend (Azure Container Apps):** The FastAPI Python backend runs in a Docker container on Azure Container Apps (or an alternative host). It connects to both Azure PostgreSQL (via `psycopg2`) and Azure SQL (via `pyodbc`) and exposes HTTP endpoints consumed by the Next.js API route proxies.

**Databases:**
- **Azure PostgreSQL** at `heliosctadb.postgres.database.azure.com` (database: `helioscta`). Schema `gas_ebbs` contains 20 pipeline critical notices tables. Both the Vercel serverless functions and the backend connect to it directly.
- **Azure SQL** at `heliosazuresql.database.windows.net` (database: `GenscapeDataFeed`). Contains Genscape nominations data in `noms_v1_2026_jan_02.source_v1_genscape_noms`. The frontend connects directly via `mssql`; the backend connects via `pyodbc`.

---

## 2. Frontend Deployment (Vercel)

### 2.1 Vercel Project Setup

1. Sign in to [vercel.com](https://vercel.com) with the GitHub account that owns the `helioscta-gas-frontend` repository.
2. Click **"Add New Project"** and import the `helioscta-gas-frontend` GitHub repository.
3. Configure as a **monorepo** with the following settings:
   - **Root Directory:** `frontend/`
   - **Framework Preset:** Next.js (auto-detected)
   - **Build Command:** `npm run build` (or leave as default)
   - **Output Directory:** `.next` (leave as default)
   - **Install Command:** `npm install` (leave as default)
   - **Node.js Version:** 20.x

### 2.2 vercel.json Configuration

Create `frontend/vercel.json` in the frontend directory:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "regions": ["iad1"],
  "functions": {
    "app/api/**/*.ts": {
      "maxDuration": 30,
      "memory": 1024
    }
  }
}
```

**Notes on the config:**
- `regions: ["iad1"]` (US East / Virginia) minimizes latency to Azure PostgreSQL and Azure SQL if the databases are in an East US Azure region. Adjust to match the DB region (e.g., `"cle1"` for US Central).
- `maxDuration: 30` gives API routes up to 30 seconds for DB queries and Python backend proxying (Vercel Pro plan allows up to 60s; Hobby plan caps at 10s). The Azure SQL Genscape queries may benefit from 30s given the `requestTimeout: 30_000` in `lib/mssql.ts`.
- `memory: 1024` provides 1 GB RAM for serverless functions that handle database query results.
- **No global `Cache-Control: no-store` header.** The Genscape Noms routes set their own `Cache-Control` headers to enable Vercel edge caching (`s-maxage=300` for data, `s-maxage=3600` for filters). A blanket `no-store` would override these. Other API routes use `force-dynamic` to prevent static optimization at build time.

### 2.3 Environment Variables (Vercel Dashboard)

Configure these in the Vercel project dashboard under **Settings > Environment Variables**. Set them for **Production**, **Preview**, and **Development** environments as needed.

#### Azure PostgreSQL Connection
| Variable | Example Value | Notes |
|---|---|---|
| `AZURE_POSTGRESQL_DB_HOST` | `heliosctadb.postgres.database.azure.com` | Azure PostgreSQL hostname |
| `AZURE_POSTGRESQL_DB_PORT` | `5432` | Standard PostgreSQL port |
| `AZURE_POSTGRESQL_DB_USER` | `<service-account-user>` | DB username |
| `AZURE_POSTGRESQL_DB_PASSWORD` | `<password>` | DB password (mark as **Sensitive**) |

Note: The database name (`helioscta`) is hardcoded in `lib/db.ts`, not read from an environment variable.

#### Azure SQL (Genscape) Connection
| Variable | Example Value | Notes |
|---|---|---|
| `AZURE_SQL_DB_HOST` | `heliosazuresql.database.windows.net` | Azure SQL Server hostname |
| `AZURE_SQL_DB_PORT` | `1433` | Standard SQL Server port |
| `AZURE_SQL_DB_NAME` | `GenscapeDataFeed` | Database name |
| `AZURE_SQL_DB_USER` | `<service-account-user>` | DB username |
| `AZURE_SQL_DB_PASSWORD` | `<password>` | DB password (mark as **Sensitive**) |

#### Python Backend
| Variable | Example Value | Notes |
|---|---|---|
| `PYTHON_API_URL` | `https://gas-backend.azurecontainerapps.io` | Full base URL of the deployed FastAPI backend (no trailing slash) |

#### NextAuth.js v5 (Authentication)
| Variable | Example Value | Notes |
|---|---|---|
| `AUTH_SECRET` | `<random-32-char-string>` | Generate with `openssl rand -base64 32`. Required for NextAuth v5. Mark as **Sensitive**. |
| `AUTH_URL` | `https://gas.helioscta.com` | The canonical URL of the Vercel deployment (custom domain or `*.vercel.app`). NextAuth v5 uses `AUTH_URL` instead of `NEXTAUTH_URL`. |
| `AUTH_MICROSOFT_ENTRA_ID_ID` | `<azure-app-client-id>` | Azure AD application (client) ID |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET` | `<azure-app-client-secret>` | Azure AD client secret. Mark as **Sensitive**. |
| `AUTH_MICROSOFT_ENTRA_ID_TENANT_ID` | `<azure-tenant-id>` | Azure AD tenant ID |
| `ALLOWED_EMAILS` | `user1@company.com,user2@company.com` | Comma-separated list of allowed email addresses (empty = allow all authenticated users) |

### 2.4 Build Settings

Vercel will auto-detect Next.js. Confirm these settings in the Vercel dashboard:

- **Framework Preset:** Next.js
- **Root Directory:** `frontend/`
- **Build Command:** `next build` (default)
- **Output Directory:** `.next` (default)
- **Install Command:** `npm install` (default)

If the project uses a `package-lock.json`, Vercel will use `npm`. If it uses `pnpm-lock.yaml`, configure the install command to `pnpm install`.

### 2.5 Serverless Function Considerations

**API Route Execution Model:**
- Every file under `frontend/app/api/**/route.ts` becomes an independent Vercel Serverless Function.
- Each function cold-starts independently. The `pg` connection pool in `lib/db.ts` and the `mssql` connection pool in `lib/mssql.ts` are each created once per function instance and reused across warm invocations. However, connection pools do NOT share across different serverless function instances.
- The `export const dynamic = "force-dynamic"` directive on API routes is compatible with Vercel and prevents unwanted static optimization.

**Key considerations:**
- The `serverExternalPackages: ["pg", "mssql", "tedious"]` setting in `next.config.ts` is required and ensures native database libraries are bundled correctly for serverless. All three packages must be listed — `tedious` is the underlying TDS driver used by `mssql`.
- The `outputFileTracingRoot` in `next.config.ts` should point to the frontend directory (already configured in the reference repo).

**Function timeout tiers:**
- Vercel Hobby: 10 seconds max
- Vercel Pro: 60 seconds max
- Vercel Enterprise: 900 seconds max
- For production with database queries and backend proxying, **Vercel Pro is the minimum recommended tier**.

### 2.6 Database Connections: Vercel Serverless to Azure Databases

The frontend connects to **two separate databases** from Vercel serverless functions.

#### 2.6.1 Azure PostgreSQL (`lib/db.ts`)

**SSL Configuration:**
The `lib/db.ts` configures SSL with `rejectUnauthorized: false`. This works for Azure PostgreSQL which uses Microsoft-managed certificates. For stricter security in production, download the Azure PostgreSQL DigiCert root CA and set:

```typescript
ssl: {
  rejectUnauthorized: true,
  ca: fs.readFileSync('/path/to/DigiCertGlobalRootG2.crt.pem').toString(),
}
```

However, since Vercel serverless functions have a read-only filesystem, the CA cert would need to be bundled as a string constant or environment variable.

**Connection Pool Settings:**
| Setting | Value | Notes |
|---|---|---|
| `max` | `5` | Max connections per pool instance |
| `idleTimeoutMillis` | `30,000` | Close idle connections after 30s |
| `connectionTimeoutMillis` | `15,000` | Fail connection attempts after 15s |
| `database` | `helioscta` | Hardcoded (not from env var) |
| SSL | `rejectUnauthorized: false` | Accepts Azure-managed certs |

**Connection Pooling Recommendations:**
- The current pool config (`max: 5, idleTimeoutMillis: 30_000`) is appropriate for serverless. Each function instance maintains up to 5 connections.
- Vercel can spin up many concurrent function instances. Under high concurrency, this could exhaust the Azure PostgreSQL connection limit (typically 100 for Basic tier, 500 for General Purpose).
- **Recommended mitigation:** Either:
  - (a) Reduce `max` to `2` or `3` per pool instance, OR
  - (b) Place a PgBouncer or Azure Database for PostgreSQL Flexible Server's built-in PgBouncer in front of the database (Azure Flexible Server supports PgBouncer natively on port 6432), OR
  - (c) Use Vercel's `@vercel/postgres` with Neon pooler (requires DB migration, not recommended for existing Azure PostgreSQL).

**Azure PostgreSQL Firewall:**
- Azure PostgreSQL must allow connections from Vercel's IP ranges. Vercel serverless functions use dynamic IPs.
- **Option A (Recommended for Azure Flexible Server):** Enable "Allow public access from any Azure service" + add Vercel's [published IP ranges](https://vercel.com/docs/security/secure-backend-access).
- **Option B (Simpler but less secure):** Set the Azure PostgreSQL firewall to allow all IPs (`0.0.0.0/0`). Only acceptable if strong password authentication and SSL are enforced.
- **Option C (Most secure):** Use Azure Private Link with Vercel Secure Compute (Enterprise plan only).

#### 2.6.2 Azure SQL / MSSQL (`lib/mssql.ts`)

**Connection Pool Settings:**
| Setting | Value | Notes |
|---|---|---|
| `pool.max` | `5` | Max connections per pool instance |
| `pool.min` | `0` | No minimum idle connections |
| `pool.idleTimeoutMillis` | `30,000` | Close idle connections after 30s |
| `connectionTimeout` | `15,000` | Fail connection attempts after 15s |
| `requestTimeout` | `30,000` | Fail queries after 30s |
| `options.encrypt` | `true` | TLS encryption enforced |
| `options.trustServerCertificate` | `false` | Validates Azure-issued certificate |

**Important serverless behavior:** In production (`NODE_ENV === "production"`), `lib/mssql.ts` creates a **new connection pool per invocation** (no `globalThis` reuse). This is safe for serverless but means each cold start pays the connection setup cost. The pool is only reused across hot-reload cycles in development.

**Azure SQL Firewall:**
- Azure SQL must allow connections from Vercel's dynamic IP ranges.
- **Option A (Recommended):** In the Azure Portal, go to the SQL Server's **Networking** blade and enable "Allow Azure services and resources to access this server" + add Vercel's IP ranges.
- **Option B (Simpler but less secure):** Add a firewall rule for `0.0.0.0` to `255.255.255.255`. Only acceptable with strong authentication and encryption enforced.

**Genscape Noms Caching:**
The `/api/genscape-noms` routes set `Cache-Control` headers to reduce database load on Vercel's edge:
- **Data route** (`/api/genscape-noms`): `public, s-maxage=300, stale-while-revalidate=60` — Vercel edge caches responses for 5 minutes, serves stale for 1 minute while revalidating.
- **Filters route** (`/api/genscape-noms/filters`): `public, s-maxage=3600, stale-while-revalidate=300` — Cached for 1 hour (filter options change infrequently), serves stale for 5 minutes while revalidating.

Note: Despite `export const dynamic = "force-dynamic"` on these routes (which prevents build-time static generation), the `Cache-Control` headers still enable Vercel's CDN edge caching at runtime. This is the intended behavior — the routes execute dynamically but responses are cached at the edge.

---

## 3. Backend Deployment Options

The FastAPI Python backend cannot run on Vercel natively. It requires a host that supports long-running Python processes with Docker support.

### 3.1 Option A: Azure Container Apps (Recommended)

**Why recommended:** Same Azure cloud and region as the PostgreSQL database, minimizing latency and simplifying network security. Azure Container Apps provides serverless container hosting with auto-scaling.

**Setup Steps:**

1. **Create Azure Container Registry (ACR):**
   ```bash
   az acr create --resource-group helioscta-rg --name heliosctaacr --sku Basic
   ```

2. **Build and push Docker image:**
   ```bash
   # From the repo root
   docker build -f backend/Dockerfile -t heliosctaacr.azurecr.io/gas-backend:latest .
   az acr login --name heliosctaacr
   docker push heliosctaacr.azurecr.io/gas-backend:latest
   ```

3. **Create Container Apps Environment:**
   ```bash
   az containerapp env create \
     --name gas-backend-env \
     --resource-group helioscta-rg \
     --location eastus
   ```

4. **Deploy Container App:**
   ```bash
   az containerapp create \
     --name gas-backend \
     --resource-group helioscta-rg \
     --environment gas-backend-env \
     --image heliosctaacr.azurecr.io/gas-backend:latest \
     --target-port 8000 \
     --ingress external \
     --min-replicas 1 \
     --max-replicas 5 \
     --cpu 1.0 \
     --memory 2.0Gi \
     --registry-server heliosctaacr.azurecr.io \
     --env-vars \
       AZURE_POSTGRESQL_DB_HOST=heliosctadb.postgres.database.azure.com \
       AZURE_POSTGRESQL_DB_PORT=5432 \
       AZURE_POSTGRESQL_DB_NAME=helioscta \
       AZURE_POSTGRESQL_DB_USER=<user> \
       AZURE_POSTGRESQL_DB_PASSWORD=secretref:db-password \
       AZURE_SQL_DB_HOST=heliosazuresql.database.windows.net \
       AZURE_SQL_DB_PORT=1433 \
       AZURE_SQL_DB_NAME=GenscapeDataFeed \
       AZURE_SQL_DB_USER=<user> \
       AZURE_SQL_DB_PASSWORD=secretref:sql-password \
       PYTHONUNBUFFERED=1
   ```

5. **Note the FQDN** (e.g., `gas-backend.azurecontainerapps.io`) and set it as `PYTHON_API_URL` in Vercel.

**Environment Variables for Backend:**

*Azure PostgreSQL:*
| Variable | Value |
|---|---|
| `AZURE_POSTGRESQL_DB_HOST` | `heliosctadb.postgres.database.azure.com` |
| `AZURE_POSTGRESQL_DB_PORT` | `5432` |
| `AZURE_POSTGRESQL_DB_NAME` | `helioscta` |
| `AZURE_POSTGRESQL_DB_USER` | `<service-account-user>` |
| `AZURE_POSTGRESQL_DB_PASSWORD` | `<password>` (use Azure secret reference) |

*Azure SQL (Genscape):*
| Variable | Value |
|---|---|
| `AZURE_SQL_DB_HOST` | `heliosazuresql.database.windows.net` |
| `AZURE_SQL_DB_PORT` | `1433` |
| `AZURE_SQL_DB_NAME` | `GenscapeDataFeed` |
| `AZURE_SQL_DB_USER` | `<service-account-user>` |
| `AZURE_SQL_DB_PASSWORD` | `<password>` (use Azure secret reference) |

*General:*
| Variable | Value |
|---|---|
| `PYTHONUNBUFFERED` | `1` |

**CORS Configuration:**
The FastAPI backend's `CORSMiddleware` currently allows all origins (`allow_origins=["*"]`). For production, restrict to the Vercel deployment domain:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://gas.helioscta.com",        # Custom domain
        "https://helioscta-gas-frontend.vercel.app",  # Vercel domain
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Networking:** Since the frontend API routes proxy to the backend server-side (within the Vercel serverless function, not from the browser), CORS is technically only needed if the frontend ever calls the backend directly from client-side JavaScript. The current architecture proxies through Next.js API routes, so the backend-to-backend communication does not require CORS. However, configuring CORS defensively is still recommended.

**Cost:** Azure Container Apps consumption plan charges per-second of vCPU and memory usage. With `min-replicas: 1`, expect approximately $30-50/month for a single always-on instance.

### 3.2 Option B: Azure App Service

**Pros:** Simpler setup, built-in CI/CD from GitHub, familiar PaaS model.
**Cons:** Less granular scaling, higher baseline cost, heavier abstraction.

**Setup Steps:**

1. **Create App Service Plan:**
   ```bash
   az appservice plan create \
     --name gas-backend-plan \
     --resource-group helioscta-rg \
     --sku B1 \
     --is-linux
   ```

2. **Create Web App with Docker:**
   ```bash
   az webapp create \
     --name gas-backend \
     --resource-group helioscta-rg \
     --plan gas-backend-plan \
     --deployment-container-image-name heliosctaacr.azurecr.io/gas-backend:latest
   ```

3. **Configure environment variables** via App Service Configuration blade (same variables as Option A).

4. **Set startup command:**
   ```
   uvicorn src.api:app --host 0.0.0.0 --port 8000
   ```

**Cost:** Azure App Service B1 tier is approximately $13/month. B2/S1 tiers for production are $25-75/month.

### 3.3 Option C: Railway / Render

**Pros:** Simplest setup, zero Azure knowledge needed, good free/hobby tiers for development.
**Cons:** Third-party infrastructure, data leaves Azure network (higher latency to Azure PostgreSQL), less control over networking.

#### Railway
1. Connect GitHub repo to Railway.
2. Set root directory to `backend/`.
3. Railway auto-detects the Dockerfile and builds.
4. Set environment variables in the Railway dashboard.
5. Railway provides a public URL (e.g., `gas-backend-production.up.railway.app`).

**Cost:** Railway Hobby plan is $5/month with $5 of usage included. Pro plan is $20/month.

#### Render
1. Create a new "Web Service" on Render.
2. Connect the GitHub repo, set root directory to `backend/`.
3. Render builds from the Dockerfile.
4. Set environment variables in the Render dashboard.
5. Render provides a public URL (e.g., `gas-backend.onrender.com`).

**Cost:** Render Starter is $7/month. Free tier spins down after inactivity (cold starts).

**Latency Note:** Railway and Render servers are typically in US regions but not in the same Azure datacenter as the PostgreSQL database. Expect 5-20ms additional latency per database query compared to Azure-hosted options.

---

## 4. Authentication

### 4.1 NextAuth.js v5 Configuration for Vercel

The authentication setup (from the reference repo's `auth.ts`) uses NextAuth.js v5 with Microsoft Entra ID. This works on Vercel without modification, but requires correct environment variables.

**Key points:**
- NextAuth.js v5 uses `AUTH_SECRET` (not `NEXTAUTH_SECRET`) and `AUTH_URL` (not `NEXTAUTH_URL`). However, Vercel auto-detects `VERCEL_URL` for preview deployments, so `AUTH_URL` is primarily needed for production with a custom domain.
- The `AUTH_SECRET` must be the same across all deployments (production and preview) to maintain session continuity.
- If using Vercel's automatic preview deployments for PRs, each preview URL is different, which can cause auth callback mismatches (see Redirect URIs below).

### 4.2 AUTH_URL / NEXTAUTH_URL Setup

| Environment | Value |
|---|---|
| Production | `https://gas.helioscta.com` (or `https://helioscta-gas-frontend.vercel.app`) |
| Preview | Omit `AUTH_URL` -- NextAuth v5 on Vercel will use `VERCEL_URL` automatically |
| Development | `http://localhost:3000` |

**Important:** On Vercel, if `AUTH_URL` is not set, NextAuth v5 falls back to the `VERCEL_URL` environment variable that Vercel injects automatically. This works for preview deployments. For production, always set `AUTH_URL` explicitly to the canonical domain.

### 4.3 Microsoft Entra ID Redirect URIs

In the Azure Portal, navigate to **Azure Active Directory > App registrations > [Your App] > Authentication > Redirect URIs** and add:

```
https://gas.helioscta.com/api/auth/callback/microsoft-entra-id
https://helioscta-gas-frontend.vercel.app/api/auth/callback/microsoft-entra-id
```

For **preview deployments** (Vercel generates unique URLs per PR), you have two options:

1. **Wildcard redirect URI** (if supported by your Entra ID config):
   ```
   https://helioscta-gas-frontend-*-<vercel-team>.vercel.app/api/auth/callback/microsoft-entra-id
   ```
   Note: Azure AD does NOT support wildcard redirect URIs. This option is not viable.

2. **Single preview URL approach (Recommended):**
   - Use a fixed Vercel branch alias (e.g., `https://staging.gas.helioscta.com`) for staging/preview.
   - Register that single URL as a redirect URI.
   - Do not enable auth for ephemeral PR preview deployments, or disable auth in preview via an environment variable flag.

3. **Alternative: Use Vercel's deployment protection** to gate preview deployments behind Vercel's built-in auth instead of NextAuth, and only configure NextAuth for production.

### 4.4 Auth Middleware

The `middleware.ts` file protects all routes except `/api/auth/*`, `/login`, and static assets. This works on Vercel's Edge Runtime. Ensure that `auth.ts` and `middleware.ts` do not use any Node.js-only APIs since Vercel middleware runs on the Edge Runtime (V8, not Node.js).

The reference repo's middleware is compatible:
```typescript
export const config = {
  matcher: ["/((?!api/auth|login|_next/static|_next/image|favicon\\.ico).*)"],
};
```

---

## 5. CI/CD

### 5.1 Frontend: Vercel Auto-Deploy from GitHub

Vercel provides built-in CI/CD for the frontend:

1. **Connect the GitHub repository** to the Vercel project (done during initial setup).
2. **Auto-deploy on push to `main`:** Every push to the `main` branch triggers a production deployment.
3. **Preview deployments on PRs:** Every pull request gets a unique preview URL.
4. **Build caching:** Vercel caches `node_modules` and `.next` build output between deployments.

**Configuration in Vercel dashboard:**
- **Production Branch:** `main`
- **Root Directory:** `frontend/`
- **Ignored Build Step (optional):** To skip deployments when only backend files change, add a custom ignore script:
  ```bash
  # frontend/vercel-ignore.sh
  #!/bin/bash
  git diff --quiet HEAD^ HEAD -- frontend/
  ```
  Then set **Ignored Build Step** in Vercel settings to: `bash vercel-ignore.sh`

### 5.2 Backend: GitHub Actions for Docker Build + Deploy

Create `.github/workflows/deploy-backend.yml` for the Python backend:

```yaml
name: Deploy Backend

on:
  push:
    branches: [main]
    paths:
      - 'backend/**'
      - '.github/workflows/deploy-backend.yml'

env:
  REGISTRY: heliosctaacr.azurecr.io
  IMAGE_NAME: gas-backend

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Log in to Azure Container Registry
        uses: azure/docker-login@v2
        with:
          login-server: ${{ env.REGISTRY }}
          username: ${{ secrets.ACR_USERNAME }}
          password: ${{ secrets.ACR_PASSWORD }}

      - name: Build and push Docker image
        run: |
          docker build -f backend/Dockerfile -t ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} -t ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest .
          docker push ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
          docker push ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest

      - name: Deploy to Azure Container Apps
        uses: azure/container-apps-deploy-action@v2
        with:
          appSourcePath: ${{ github.workspace }}
          acrName: heliosctaacr
          containerAppName: gas-backend
          resourceGroup: helioscta-rg
          imageToDeploy: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
```

**GitHub Secrets required:**
| Secret | Description |
|---|---|
| `ACR_USERNAME` | Azure Container Registry username |
| `ACR_PASSWORD` | Azure Container Registry password |

If using Azure App Service or Railway/Render instead, replace the deploy step with the appropriate action or CLI command.

---

## 6. DNS and Custom Domain (Optional)

### 6.1 Frontend (Vercel)

1. In Vercel dashboard, go to **Settings > Domains**.
2. Add the custom domain (e.g., `gas.helioscta.com`).
3. Vercel provides the DNS record to add:
   - **Type:** CNAME
   - **Name:** `gas` (or subdomain)
   - **Value:** `cname.vercel-dns.com`
4. Vercel automatically provisions and renews SSL/TLS certificates via Let's Encrypt.

### 6.2 Backend (Azure Container Apps)

1. In Azure Portal, go to the Container App's **Custom domains** blade.
2. Add `gas-api.helioscta.com` (or similar).
3. Add the DNS records Azure provides (CNAME or A record + TXT verification).
4. Azure provisions a managed TLS certificate.

### 6.3 Update References

After setting custom domains:
- Update `PYTHON_API_URL` in Vercel to `https://gas-api.helioscta.com`
- Update `AUTH_URL` in Vercel to `https://gas.helioscta.com`
- Update Microsoft Entra ID redirect URIs to use the custom domain

---

## 7. Step-by-Step Deployment Checklist

### Phase 1: Prerequisites

- [ ] Ensure the repo has been refactored into `frontend/` and `backend/` directories
- [ ] Verify `frontend/package.json` has correct `build` and `start` scripts
- [ ] Verify `frontend/next.config.ts` includes `serverExternalPackages: ["pg", "mssql", "tedious"]`
- [ ] Verify `frontend/lib/db.ts` has SSL enabled for Azure PostgreSQL
- [ ] Verify `frontend/lib/mssql.ts` has encryption enabled for Azure SQL
- [ ] Verify `backend/Dockerfile` builds and runs correctly (`docker build -f backend/Dockerfile . && docker run -p 8000:8000 <image>`)
- [ ] Obtain Azure PostgreSQL credentials for the deployment service account
- [ ] Obtain Azure SQL credentials for the deployment service account
- [ ] Generate `AUTH_SECRET` value: `openssl rand -base64 32`

### Phase 2: Deploy the Python Backend

- [ ] Create Azure Container Registry (or choose alternative host)
- [ ] Build and push the backend Docker image
- [ ] Create the Azure Container Apps environment and deploy the container
- [ ] Set all environment variables on the container app
- [ ] Verify the backend health endpoint responds: `curl https://<backend-url>/health`
- [ ] Verify the backend can connect to Azure PostgreSQL
- [ ] Verify the backend can connect to Azure SQL (GenscapeDataFeed)
- [ ] Note the backend FQDN for the `PYTHON_API_URL` variable

### Phase 3: Deploy the Frontend to Vercel

- [ ] Create a Vercel account (or use existing) and link the GitHub repository
- [ ] Set the root directory to `frontend/`
- [ ] Confirm framework preset is Next.js
- [ ] Add `vercel.json` to `frontend/` (or configure via dashboard)
- [ ] Add all environment variables to the Vercel project dashboard:
  - [ ] **Azure PostgreSQL:** `AZURE_POSTGRESQL_DB_HOST`, `AZURE_POSTGRESQL_DB_PORT`, `AZURE_POSTGRESQL_DB_USER`, `AZURE_POSTGRESQL_DB_PASSWORD`
  - [ ] **Azure SQL (Genscape):** `AZURE_SQL_DB_HOST`, `AZURE_SQL_DB_PORT`, `AZURE_SQL_DB_NAME`, `AZURE_SQL_DB_USER`, `AZURE_SQL_DB_PASSWORD`
  - [ ] `PYTHON_API_URL` (set to the backend FQDN from Phase 2)
  - [ ] `AUTH_SECRET`
  - [ ] `AUTH_URL`
  - [ ] `AUTH_MICROSOFT_ENTRA_ID_ID`
  - [ ] `AUTH_MICROSOFT_ENTRA_ID_SECRET`
  - [ ] `AUTH_MICROSOFT_ENTRA_ID_TENANT_ID`
  - [ ] `ALLOWED_EMAILS`
- [ ] Trigger the first deployment (push to `main` or click "Deploy" in Vercel)
- [ ] Verify the build succeeds in the Vercel dashboard

### Phase 4: Configure Authentication

- [ ] Go to Azure Portal > Azure Active Directory > App registrations
- [ ] Add the Vercel deployment URL to the app's redirect URIs:
  `https://<vercel-domain>/api/auth/callback/microsoft-entra-id`
- [ ] Test the login flow end-to-end: visit the deployed URL, get redirected to Microsoft login, and authenticate successfully

### Phase 5: Verification

- [ ] Verify the frontend loads at the Vercel URL
- [ ] Verify authentication works (sign in with Microsoft Entra ID)
- [ ] Verify API routes that query PostgreSQL directly return data (e.g., dashboard endpoint)
- [ ] Verify API routes that query Azure SQL return data (e.g., `/api/genscape-noms`)
- [ ] Verify Genscape Noms edge caching works (`Cache-Control` headers present in responses)
- [ ] Verify API routes that proxy to the Python backend return data
- [ ] Check Vercel function logs for any connection errors or timeouts
- [ ] Check Azure Container Apps logs for any backend errors

### Phase 6: CI/CD Setup

- [ ] Verify Vercel auto-deploys on push to `main` (frontend)
- [ ] Create `.github/workflows/deploy-backend.yml` for backend CI/CD
- [ ] Add `ACR_USERNAME` and `ACR_PASSWORD` to GitHub repository secrets
- [ ] Test the backend CI/CD pipeline by pushing a change to `backend/`
- [ ] (Optional) Add the Vercel ignore script to skip frontend builds when only backend files change

### Phase 7: Custom Domain (Optional)

- [ ] Add custom domain in Vercel dashboard
- [ ] Configure DNS CNAME record
- [ ] Add custom domain for the backend in Azure
- [ ] Update `AUTH_URL`, `PYTHON_API_URL`, and Entra ID redirect URIs to use custom domains
- [ ] Verify SSL certificates are provisioned and active
- [ ] Test the full flow on the custom domain

### Phase 8: Production Hardening

- [ ] Review and tighten the Azure PostgreSQL firewall rules for Vercel IPs
- [ ] Review and tighten the Azure SQL firewall rules for Vercel IPs
- [ ] Restrict CORS origins on the FastAPI backend to only the Vercel domain
- [ ] Enable Azure PostgreSQL PgBouncer (if using Flexible Server) to handle serverless connection pooling
- [ ] Set up monitoring/alerting: Vercel Analytics, Azure Container Apps metrics, Azure PostgreSQL metrics, Azure SQL metrics
- [ ] Configure Vercel Deployment Protection for preview deployments (if on Pro/Enterprise plan)
- [ ] Review `pg` pool settings: consider reducing `max` from 5 to 2-3 for serverless
- [ ] Review `mssql` pool settings: consider reducing `max` from 5 to 2-3 for serverless
- [ ] Verify the `AUTH_SECRET` is consistent across production and preview environments
- [ ] Verify Genscape Noms cache durations are appropriate for production (currently 5min data / 1hr filters)
