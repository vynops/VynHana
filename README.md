<div align="center">

# VynHana

### AI-Powered SAP HANA Operations Dashboard

**Self-hosted · SAP HANA Cloud & On-Premise · Enterprise Ready**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![SAP HANA](https://img.shields.io/badge/SAP_HANA-Cloud_%26_On--Premise-0FAAFF?logo=sap&logoColor=white)](https://www.sap.com/products/technology-platform/hana.html)
[![Live Demo](https://img.shields.io/badge/Live_Demo-hana.vynops.online-10b981)](https://hana.vynops.online)
[![Part of VynOps](https://img.shields.io/badge/Part_of-VynOps_Suite-6366f1)](https://vynops.com)

*Monitor. Tune. Secure. Automate. Your SAP HANA estate from one intelligent dashboard.*

[**Live Demo**](https://hana.vynops.online) · [**VynOps Suite**](https://vynops.com)

</div>

---

## Overview

VynHana is a production-grade, self-hosted **SAP HANA monitoring and operations platform** that brings memory analysis, query tuning, HSR replication health, backup management, security auditing, incident response, and AI-assisted DBA support into a single intelligent dashboard.

Built on **Next.js 16 App Router** with a lightweight JSON file store and Groq-powered AI, VynHana connects directly to your HANA instances via `@sap/hana-client` — no agents, no sidecars, no SAP Cockpit dependency.

Compatible with:
- **SAP HANA Cloud** (BTP free tier, standard, enterprise)
- **SAP HANA on-premise** (SPS 02 and later)
- **SAP HANA Express Edition**
- **Multi-Database Container (MDC)** setups — system DB and tenant DBs

> **Design philosophy:** VynHana does not replace your DBA team. It gives every engineer on-call visibility equivalent to your most experienced HANA DBA.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Installation](#installation)
  - [Local Development](#local-development)
  - [Production with PM2](#production-with-pm2)
  - [nginx Reverse Proxy](#nginx-reverse-proxy)
- [Connecting to HANA](#connecting-to-hana)
  - [HANA Cloud](#hana-cloud)
  - [HANA On-Premise](#hana-on-premise)
- [Configuration](#configuration)
- [Default Credentials](#default-credentials)
- [Role Permissions](#role-permissions)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Tech Stack](#tech-stack)
- [HANA Cloud Compatibility Notes](#hana-cloud-compatibility-notes)
- [Troubleshooting](#troubleshooting)
- [Related Projects](#related-projects)
- [License](#license)

---

## Features

### 📊 System Overview
A single-pane-of-glass view across all connected HANA instances.

- **Per-connection health cards** — version, active services, uptime, MDC flag
- **Active services count** from `M_SERVICES`
- **System DB context** — detects HANA Cloud vs on-premise, MDC vs single-container
- **Connection status** — live test on demand, visual online/offline badge
- **Multi-connection support** — manage and monitor multiple HANA instances simultaneously

### 🖥 Services Monitor
Live view of all HANA services running on each host.

- Service name, host, port, coordinator type from `M_SERVICES`
- Auto-refreshes every 30 seconds

### 🔔 Alerts
HANA system alerts dashboard.

- Reads from `M_ALERTS` (on-premise) with graceful fallback for HANA Cloud
- Alert category, priority, and timestamp
- Grouped by connection

### 📈 Performance Monitoring
Host-level performance metrics from native HANA monitoring views.

- **CPU** — from `M_HOST_RESOURCE_UTILIZATION`
- **Memory** — `INSTANCE_TOTAL_MEMORY_USED_SIZE`, physical memory usage
- **Connections** — active vs total from `M_CONNECTIONS`
- **IO** — volume IO statistics (on-premise)
- Per-host breakdown for scale-out systems

### 🧠 Memory Analysis
Deep memory breakdown across the full HANA memory hierarchy.

- **Instance memory** — `INSTANCE_TOTAL_MEMORY_USED_SIZE` from `M_HOST_RESOURCE_UTILIZATION`
- **Heap allocators** — `EXCLUSIVE_SIZE_IN_USE` from `M_HEAP_MEMORY`, grouped by host
- **Shared memory** — per-host shared segment usage
- **Column store memory** — `MEMORY_SIZE_IN_TOTAL`, `MEMORY_SIZE_IN_DELTA`, `MEMORY_SIZE_IN_MAIN` aggregated from `M_CS_TABLES`

### 🗂 Column Store Analysis
Table-level column store health — the most critical day-to-day HANA monitoring view.

- **Summary cards** — total CS memory (GB), main store, delta store, loaded/unloaded table count
- **Tables tab** — all column store tables sorted by memory, delta size, or row count
- **Unloads tab** — tables evicted from memory (causes slow first-access queries)
- **Delta tab** — top delta store consumers (delta merge candidates)
- All data from `M_CS_TABLES` — real metrics, not estimates

### 🔍 Query Analyzer
Plan cache analysis and top expensive queries.

- **Plan cache summary** — hit rate, cache size, eviction count from `M_SQL_PLAN_CACHE_OVERVIEW`
- **Top expensive queries** — from `M_SQL_PLAN_CACHE`, sorted by total execution time
- **Execution stats** — total CPU minutes, unique statements, unique users
- Filter by SQL text or username

### ⚡ Slow Queries
Statement-level slow query tracking from HANA's expensive statements trace.

- Reads from `M_EXPENSIVE_STATEMENTS`
- Execution time, CPU time, memory usage, lock wait time per statement
- User and application name attribution
- Auto-refreshes every 30 seconds

### 💻 SQL Terminal
Full interactive SQL console for live query execution against any connected HANA system.

- **Live execution** via `@sap/hana-client` — results in milliseconds
- **Auto-limit** — SELECT queries without `LIMIT` are automatically capped at 500 rows
- **Results table** — sortable columns, NULL display, row count, execution time
- **Error display** — exact HANA error message with position information
- **Query history** — last 20 queries per session, click to reload
- Requires `editor` role or above

### 📐 Schema Explorer
Live schema browsing for all connected HANA databases.

- Tables, views, row counts, partition details
- Column definitions — name, data type, length, nullable, default
- Index definitions — index name, columns, uniqueness, type
- Search by table name or schema name
- Data from `M_TABLES`, `TABLE_COLUMNS`, `INDEXES`

### 🔁 Replication / HSR
SAP HANA System Replication health monitoring.

- **Service replication status** — replication mode, status, details from `M_SERVICE_REPLICATION`
- **Secondary host/port** — identify which services are replicating to which targets
- **Replication sites** — from `M_SYSTEM_REPLICATION_SITES` (on-premise / MDC)
- Graceful fallback for HANA Cloud free tier where HSR views are unavailable

### 💾 Backup Management
Backup catalog inspection and volume status.

- **Recent backups** — from `M_BACKUP_CATALOG`: entry type, start/end time, state
- **Backup files** — from `M_BACKUP_CATALOG_FILES`: destination, message, source ID
- **Volume status** — service name, host, port from `M_VOLUMES`
- Configurable limit (default 50 most recent entries)

### 📦 Capacity Planning
Storage capacity view from HANA's disk and volume monitoring.

- **Disk usage** — host, usage type, used GB from `M_DISK_USAGE`
- **Volume detail** — service name, host, port, used GB from `M_VOLUMES`
- **Host resource summary** — physical memory used as data volume proxy
- Graceful 0-fill for HANA Cloud where `TOTAL_SIZE`/`MAX_SIZE`/`FREE_SIZE` are unavailable

### 🔒 Security & Compliance
HANA user and privilege monitoring.

- **Active users** — from `SYS.USERS`, status, creation date, last successful login
- **Role assignments** — from `SYS.GRANTED_ROLES`, user-to-role mapping
- **Privilege audit** — system privileges from `SYS.GRANTED_PRIVILEGES`
- **Invalid users** — locked or expired accounts highlighted

### 🚨 Incident Management
Full incident lifecycle from raise to resolution.

- **Create incidents** manually with severity (critical/high/medium/low) and category
- **Acknowledge / resolve / assign** with notes and timestamps
- **SLA tracking** — configurable ack/resolve targets per severity
- **Alert routing** — route incidents to Slack based on severity and category
- **Audit trail** — every state change recorded with timestamp
- Stored in `data/incidents.json`

### 📞 On-Call Schedule
Weekly on-call rotation management.

- Rotation list with names, email, phone
- Current on-call automatically determined from schedule
- Week-by-week assignment
- Stored in `data/oncall.json`

### ⏱ SLA Tracker
SLA compliance monitoring per incident severity.

- Configurable SLA targets: acknowledge window and resolve window per severity
- Breach detection — incidents that missed their SLA window
- Historical compliance summary

### 🤖 AI Pilot (Copilot)
A conversational SAP HANA DBA expert powered by Groq.

**System knowledge:**
- Full SAP HANA monitoring views (`M_*`, `SYS.*`)
- HANA Cloud vs on-premise differences and limitations
- Memory management, column store, delta merge, unload/reload behaviour
- HSR configuration, lag monitoring, failover procedures
- Backup and recovery strategies (HANA Cloud managed and on-premise BACKINT)
- Security: users, roles, privileges, audit policies, identity federation
- MDC administration — system DB vs tenant DB queries
- Slow query diagnosis: plan cache cold start, bind sensitivity, statistics refresh
- Connection issues: pool saturation, "No Connection Available" diagnostics

**System context injection** — when a HANA connection is selected, the copilot receives live system version and active service count, allowing version-specific answers.

**Prompt library** — 8 curated, core DBA prompts always visible:
- Top memory-consuming column store tables
- Find and kill blocking sessions
- Expensive queries from M_SQL_PLAN_CACHE
- Delta merge: when it runs and how to force it
- Monitor HSR replication lag with SQL
- Query M_BACKUP_CATALOG for recent backup status
- Create a read-only monitoring user with minimum privileges
- Column store unload and reload — causes and prevention

**Conversation history** — persisted server-side in `data/copilot-history.json`, with token usage tracking (prompt, completion, total).

Powered by **Groq** (`llama-3.3-70b-versatile` by default). Configure the model and API key in Settings.

### ⚙ Automation Engine
Rule-based automation with full audit trail.

- **Trigger types:** cron (scheduled) or threshold (metric breach)
- **Action types:** `run_sql`, `slack_notify`, `kill_query`, `restart_service`
- **Run history** — last runs stored per rule with output and status
- **Enable/disable** per rule without deleting
- Stored in `data/automation-rules.json` and `data/automation-runs.json`

### 🧬 Autonomous Ops
AI-generated, human-approved remediation proposals.

- Auto-generated from detected anomalies (slow queries, memory pressure, replication lag)
- Each proposal includes: severity, risk level, confidence %, estimated gain, proposed SQL
- **Approve** → real execution against the target HANA system
- **Dismiss** with audit record
- Stored in `data/autonomous-proposals.json`

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                  Browser (React / SWR)                    │
│  Dashboard UI  ←──── REST JSON API ────→  Next.js Routes  │
└──────────────────────────┬───────────────────────────────┘
                           │
              ┌────────────▼────────────┐
              │   @sap/hana-client       │
              │   Connection Pool        │
              │   Map<id, HanaConn>      │
              └────────────┬────────────┘
                           │ SSL / port 443 (Cloud)
                           │ TCP (on-premise)
              ┌────────────▼────────────┐
              │   SAP HANA Instance      │
              │   M_* / SYS.* views      │
              └─────────────────────────┘

              ┌─────────────────────────┐
              │   data/*.json store      │
              │  connections.json        │
              │  users.json              │
              │  incidents.json          │
              │  oncall.json             │
              │  automation-rules.json   │
              │  autonomous-proposals.json│
              │  copilot-history.json    │
              │  settings.json           │
              └─────────────────────────┘
```

**Key design decisions:**

- **No external database** — JSON file store keeps deployment footprint to zero. All app state fits in `data/`.
- **Single connection pool** — one `HanaClientConnection` per connection ID, reused across requests. Pool entries are validated with `.state() === 'connected'` before reuse.
- **Query error isolation** — `queryHana()` catches all driver errors and returns `[]`, preventing cascade failures when one monitoring view is unavailable (e.g., on HANA Cloud free tier).
- **HANA Cloud auto-detection** — `isHanaCloudHost()` detects `*.hanacloud.ondemand.com` hostnames and skips `databaseName` parameter (which breaks Cloud SQL endpoint connections).
- **JWT auth** — HS256 JWT in `vynhana_token` cookie, 8-hour sessions, validated at middleware layer before any API route executes.

---

## Requirements

- Node.js 20+
- npm 9+
- PM2 (`npm install -g pm2`)
- SAP HANA instance (Cloud or on-premise) with a user that has `MONITORING` or `DATA_ADMIN` role
- A Groq API key (free at [console.groq.com](https://console.groq.com)) for AI Copilot

---

## Installation

### Local Development

```bash
git clone https://github.com/vynops/vynhana.git
cd vynhana
npm install
# Edit data/settings.json and set your groqApiKey
npm run dev
```

App runs on **http://localhost:3070**

### Production with PM2

```bash
# Install dependencies
npm install --omit=dev

# Build
npm run build

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # enable auto-start on reboot

# Check status
pm2 list
pm2 logs vynhana
```

### nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name hana.yourdomain.com;

    location / {
        proxy_pass         http://localhost:3070;
        proxy_http_version 1.1;
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection upgrade;
        proxy_set_header Host       $host;
        proxy_cache_bypass          $http_upgrade;
        proxy_read_timeout          120s;
    }
}
```

For HTTPS, use Certbot:

```bash
sudo certbot --nginx -d hana.yourdomain.com
```

---

## Connecting to HANA

### HANA Cloud

| Field | Value |
|---|---|
| **Host** | `<guid>.hna0.prod-us10.hanacloud.ondemand.com` (your SQL endpoint) |
| **Port** | `443` |
| **Username** | `DBADMIN` (or a dedicated monitoring user) |
| **SSL** | ✅ Enabled |
| **Database name** | Leave blank — HANA Cloud SQL endpoint resolves the DB automatically |
| **MDC** | ✅ |

> **Important:** If DBADMIN has a forced password change flag set, queries will fail silently. Run `ALTER USER DBADMIN PASSWORD <pwd> NO FORCE_FIRST_PASSWORD_CHANGE` in SAP HANA Database Explorer to clear it.

**HANA Cloud free tier limitations:** The following views are not available and are handled gracefully (return empty data):

| View | Reason |
|---|---|
| `M_ALERTS` / `M_ALERT_DEFINITIONS` | Not exposed on free tier |
| `M_SYSTEM_REPLICATION_SITES` | HSR not available on free tier |
| `M_DISK_USAGE`.`TOTAL_SIZE` | Column not present in Cloud edition |
| `M_VOLUMES`.`MAX_SIZE` | Column not present in Cloud edition |
| `M_SHARED_MEMORY`.`EXCLUSIVE_SIZE_IN_USE` | Column not present in Cloud edition |

### HANA On-Premise

| Field | Value |
|---|---|
| **Host** | Your HANA server hostname or IP |
| **Port** | `39015` (system DB), `39017` (tenant DB), or your configured port |
| **Username** | `SYSTEM` or a monitoring user |
| **SSL** | Optional — enable if your HANA has SSL configured |
| **Database name** | For MDC: the tenant DB name (e.g., `HDB`). Leave blank for single-container. |

**Minimum required privileges for a read-only monitoring user:**

```sql
-- Create monitoring user
CREATE USER VYNHANA_MON PASSWORD "YourPassword123" NO FORCE_FIRST_PASSWORD_CHANGE;

-- Grant monitoring role
GRANT MONITORING TO VYNHANA_MON;

-- For schema explorer (optional)
GRANT CATALOG READ TO VYNHANA_MON;
```

---

## Configuration

Configure in **Settings** (in-app at `/settings`) or directly in `data/settings.json`:

| Key | Default | Description |
|---|---|---|
| `groqApiKey` | — | Groq API key for AI Copilot. Get one free at [console.groq.com](https://console.groq.com) |
| `aiModel` | `llama-3.3-70b-versatile` | Groq model. Also supports `llama-3.1-8b-instant`, `mixtral-8x7b-32768` |
| `slowQueryThresholdMs` | `1000` | Flag expensive statements above this threshold (ms) |
| `replicationLagAlertSec` | `30` | Auto-raise incident when HSR lag exceeds N seconds |
| `defaultRefreshInterval` | `30` | Dashboard auto-refresh interval (seconds) |
| `timezone` | `UTC` | Display timezone for timestamps |
| `slackWebhookUrl` | — | Slack webhook URL for incident notifications |
| `alertEmailEnabled` | `false` | Enable email alerts via SMTP |
| `smtpHost` / `smtpPort` / `smtpUser` / `smtpPassword` | — | SMTP credentials for email alerts |

### Environment Variables

Set in `.env.local` (development) or the PM2 environment:

```bash
JWT_SECRET=your-jwt-secret-minimum-32-characters   # REQUIRED in production
GROQ_API_KEY=gsk_...                                # optional if set in app settings
```

> **Production:** Always set `JWT_SECRET` to a strong random value. The default `vynhana-dev-secret-change-in-production` must not be used in production.

Generate a secure secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Default Credentials

| User | Email | Password | Role |
|---|---|---|---|
| Admin | `admin@vynhana.local` | `changeme` | Full access |

> **Change this immediately in production** via Settings → Team, or by editing `data/users.json`.

---

## Role Permissions

| Action | Admin | Editor | Viewer |
|---|---|---|---|
| View all dashboard pages | ✅ | ✅ | ✅ |
| Use AI Copilot | ✅ | ✅ | ✅ |
| Add / edit HANA connections | ✅ | ✅ | ❌ |
| Run SQL Terminal queries | ✅ | ✅ | ❌ |
| Acknowledge / resolve incidents | ✅ | ✅ | ❌ |
| Create / edit automation rules | ✅ | ✅ | ❌ |
| Approve autonomous proposals | ✅ | ✅ | ❌ |
| Manage settings | ✅ | ❌ | ❌ |
| Manage users / team | ✅ | ❌ | ❌ |
| Clear AI Copilot history | ✅ | ✅ | ❌ |

---

## Project Structure

```
vynhana/
├── src/
│   ├── app/
│   │   ├── (dashboard)/            # All authenticated dashboard pages
│   │   │   ├── overview/           # Fleet overview — all connections at a glance
│   │   │   ├── tenants/            # Connection management (add/edit/test/delete)
│   │   │   ├── services/           # M_SERVICES — running HANA services
│   │   │   ├── alerts/             # M_ALERTS — system alert history
│   │   │   ├── performance/        # Host CPU, memory, IO, connections
│   │   │   ├── memory/             # Instance, heap, shared, column store memory
│   │   │   ├── column-store/       # M_CS_TABLES — delta, unloads, top tables
│   │   │   ├── queries/            # M_SQL_PLAN_CACHE — expensive query analysis
│   │   │   ├── slow-queries/       # M_EXPENSIVE_STATEMENTS
│   │   │   ├── sql/                # Interactive SQL Terminal (live execution)
│   │   │   ├── schema/             # Schema explorer — tables, columns, indexes
│   │   │   ├── replication/        # M_SERVICE_REPLICATION — HSR health
│   │   │   ├── backups/            # M_BACKUP_CATALOG — backup history and volumes
│   │   │   ├── capacity/           # M_DISK_USAGE, M_VOLUMES — storage capacity
│   │   │   ├── incidents/          # Incident management — raise, ack, resolve
│   │   │   ├── oncall/             # On-call rotation schedule
│   │   │   ├── sla/                # SLA compliance tracking
│   │   │   ├── security/           # Users, roles, privileges audit
│   │   │   ├── copilot/            # AI Pilot — Groq-powered HANA expert
│   │   │   ├── automation/         # Rule-based automation engine
│   │   │   ├── autonomous/         # AI-generated remediation proposals
│   │   │   ├── team/               # User management
│   │   │   └── settings/           # App settings (AI key, thresholds, SMTP)
│   │   ├── api/                    # REST API routes (one per feature)
│   │   │   ├── auth/               # login / logout / me
│   │   │   ├── connections/        # CRUD + test endpoint
│   │   │   ├── overview/           # Aggregated connection health
│   │   │   ├── services/           # M_SERVICES
│   │   │   ├── performance/        # M_HOST_RESOURCE_UTILIZATION, M_CONNECTIONS
│   │   │   ├── memory/             # M_HEAP_MEMORY, M_CS_TABLES, M_SHARED_MEMORY
│   │   │   ├── column-store/       # M_CS_TABLES detailed
│   │   │   ├── queries/            # M_SQL_PLAN_CACHE, M_SQL_PLAN_CACHE_OVERVIEW
│   │   │   ├── slow-queries/       # M_EXPENSIVE_STATEMENTS
│   │   │   ├── sql/                # Live SQL execution endpoint
│   │   │   ├── schema/             # M_TABLES, TABLE_COLUMNS, INDEXES
│   │   │   ├── replication/        # M_SERVICE_REPLICATION, M_SYSTEM_REPLICATION_SITES
│   │   │   ├── backups/            # M_BACKUP_CATALOG, M_BACKUP_CATALOG_FILES
│   │   │   ├── capacity/           # M_DISK_USAGE, M_VOLUMES
│   │   │   ├── alerts/             # M_ALERTS, M_ALERT_DEFINITIONS
│   │   │   ├── incidents/          # Incident CRUD
│   │   │   ├── oncall/             # On-call CRUD
│   │   │   ├── sla/                # SLA data
│   │   │   ├── security/           # SYS.USERS, GRANTED_ROLES, GRANTED_PRIVILEGES
│   │   │   ├── copilot/            # Groq AI chat + history
│   │   │   ├── automation/         # Automation rules CRUD + execution
│   │   │   ├── autonomous/         # Proposals CRUD + approve
│   │   │   ├── team/               # User management
│   │   │   └── settings/           # Settings read/write
│   │   ├── login/                  # Login page
│   │   ├── layout.tsx              # Root layout
│   │   └── globals.css             # Global styles
│   ├── components/
│   │   └── layout/
│   │       ├── DashboardLayout.tsx # Authenticated shell (sidebar + header)
│   │       ├── Sidebar.tsx         # Navigation sidebar with 5 groups
│   │       ├── Header.tsx          # Top header bar
│   │       └── DemoBanner.tsx      # Demo mode banner
│   ├── lib/
│   │   ├── hana-client.ts          # Connection pool + queryHana() + execQuery()
│   │   ├── connection-store.ts     # HANA connection CRUD + XOR password encode
│   │   ├── auth.ts                 # JWT sign/verify + requireRole middleware
│   │   ├── copilot.ts              # Groq client + HANA_COPILOT_SYSTEM prompt
│   │   ├── mock-hana.ts            # Demo mode mock data
│   │   ├── user-store.ts           # User CRUD (data/users.json)
│   │   ├── incident-store.ts       # Incident CRUD (data/incidents.json)
│   │   ├── oncall-store.ts         # On-call CRUD (data/oncall.json)
│   │   ├── automation-store.ts     # Automation rules + run history
│   │   ├── autonomous-store.ts     # Autonomous proposals
│   │   ├── copilot-history-store.ts# AI conversation persistence
│   │   ├── backup-schedule-store.ts# Backup schedule management
│   │   ├── settings-store.ts       # Settings read/write
│   │   ├── jwt-edge.ts             # Edge-compatible JWT for middleware
│   │   └── utils.ts                # cn() helper
│   └── middleware.ts               # Auth middleware — protects all /dashboard routes
├── data/                           # JSON file store (gitignore sensitive files)
│   ├── connections.json            # HANA connection definitions (passwords XOR-encoded)
│   ├── users.json                  # App users with bcrypt password hashes
│   ├── settings.json               # App configuration
│   ├── incidents.json              # Incident records
│   ├── oncall.json                 # On-call schedule
│   ├── automation-rules.json       # Automation rules
│   ├── automation-runs.json        # Automation run history
│   ├── autonomous-proposals.json   # AI-generated proposals
│   ├── backup-schedules.json       # Backup schedule config
│   └── copilot-history.json        # AI conversation history
├── ecosystem.config.js             # PM2 process definition
├── next.config.ts                  # Next.js config
├── tsconfig.json
└── package.json
```

---

## API Reference

All API routes require a valid `vynhana_token` JWT cookie. Most GET routes require `viewer` role; POST/PATCH/DELETE require `editor` or `admin`.

| Method | Route | Role | Description |
|---|---|---|---|
| POST | `/api/auth/login` | — | Authenticate, returns JWT cookie |
| POST | `/api/auth/logout` | — | Clear JWT cookie |
| GET | `/api/auth/me` | viewer | Current session user |
| GET | `/api/connections` | viewer | List all HANA connections |
| POST | `/api/connections` | editor | Add a new connection |
| PATCH | `/api/connections/[id]` | editor | Update a connection |
| DELETE | `/api/connections/[id]` | admin | Delete a connection |
| POST | `/api/connections/[id]/test` | viewer | Test connectivity |
| GET | `/api/overview` | viewer | Health summary for all connections |
| GET | `/api/services` | viewer | M_SERVICES from all connections |
| GET | `/api/performance` | viewer | CPU, memory, IO, connection stats |
| GET | `/api/memory` | viewer | Memory breakdown per host |
| GET | `/api/column-store` | viewer | Column store tables, unloads, delta |
| GET | `/api/queries` | viewer | Plan cache summary + expensive queries |
| GET | `/api/slow-queries` | viewer | M_EXPENSIVE_STATEMENTS |
| POST | `/api/sql` | editor | Execute arbitrary SQL on a connection |
| GET | `/api/schema` | viewer | Tables, columns, indexes |
| GET | `/api/replication` | viewer | HSR status and sites |
| GET | `/api/backups` | viewer | Backup catalog and volume status |
| GET | `/api/capacity` | viewer | Disk and volume capacity |
| GET | `/api/alerts` | viewer | HANA system alerts |
| GET/POST | `/api/incidents` | viewer/editor | List or create incidents |
| PATCH/DELETE | `/api/incidents/[id]` | editor | Update or delete an incident |
| GET/POST | `/api/oncall` | viewer/editor | On-call schedule |
| GET | `/api/sla` | viewer | SLA compliance data |
| GET | `/api/security` | viewer | Users, roles, privileges |
| GET | `/api/copilot` | viewer | History + usage stats |
| POST | `/api/copilot` | viewer | Send message to AI Copilot |
| DELETE | `/api/copilot` | editor | Clear AI conversation history |
| GET/POST | `/api/automation` | viewer/editor | Automation rules |
| GET/POST | `/api/autonomous` | viewer/editor | Autonomous proposals |
| GET | `/api/team` | admin | List users |
| GET/POST | `/api/settings` | viewer/admin | Read or update app settings |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 16.2](https://nextjs.org) (App Router, React Server Components) |
| Language | [TypeScript 5](https://www.typescriptlang.org) |
| UI | [React 19](https://react.dev), [Tailwind CSS 4](https://tailwindcss.com), [Lucide Icons](https://lucide.dev) |
| Charts | [Recharts 2](https://recharts.org) |
| Data fetching | [SWR 2](https://swr.vercel.app) |
| HANA driver | [@sap/hana-client 2.21.31](https://www.npmjs.com/package/@sap/hana-client) |
| AI | [Groq SDK](https://console.groq.com) — `llama-3.3-70b-versatile` (default) |
| Auth | [jose 5](https://github.com/panva/jose) — HS256 JWT, 8h sessions |
| Email | [nodemailer 9](https://nodemailer.com) |
| Process manager | [PM2](https://pm2.keymetrics.io) |
| Data store | JSON files (`data/*.json`) |

---

## HANA Cloud Compatibility Notes

VynHana handles HANA Cloud vs on-premise differences automatically. The following on-premise-only monitoring views return empty results on HANA Cloud (handled with `.catch(() => [])` — no errors, no crashes):

| View | On-Premise | HANA Cloud |
|---|---|---|
| `M_ALERTS` | ✅ | ❌ Not available |
| `M_ALERT_DEFINITIONS` | ✅ | ❌ Not available |
| `M_SYSTEM_REPLICATION_SITES` | ✅ | ❌ Not available on free tier |
| `M_VOLUME_IO_TOTAL_STATISTICS` | ✅ | ❌ Not available |
| `M_DISK_USAGE.TOTAL_SIZE` | ✅ | ❌ Column absent |
| `M_DISK_USAGE.FREE_SIZE` | ✅ | ❌ Column absent |
| `M_VOLUMES.MAX_SIZE` | ✅ | ❌ Column absent |
| `M_SHARED_MEMORY.EXCLUSIVE_SIZE_IN_USE` | ✅ | ❌ Column absent |
| `M_SQL_PLAN_CACHE_OVERVIEW.PLAN_CACHE_EVICTIONS` | ✅ | ❌ Column absent |
| `M_SERVICE_REPLICATION.REPLICATION_DELAY_MS` | ✅ | ❌ Column absent |
| `M_BACKUP_CATALOG.BACKUP_SIZE` | ✅ | ❌ Column absent |

All missing columns are replaced with `0` or `''` literals in the queries so pages load without errors. When HANA Cloud exposes these metrics, no code change is needed — the literal can simply be reverted.

---

## Troubleshooting

### "No Connection Available" error
The HANA client driver's connection pool slot is broken or timed out.
1. Go to **Tenant DBs** and click **Test** on the affected connection — this will attempt a fresh connection.
2. If the test fails, verify the host, port, username, and password are correct.
3. On HANA Cloud, ensure the SQL endpoint URL is correct (from the BTP cockpit → HANA Cloud Central → Actions → Open in SAP HANA Cockpit).
4. Restart PM2 to reset the connection pool: `pm2 restart vynhana`

### HANA Cloud DBADMIN "force password change" loop
After SAP provisions a new HANA Cloud instance, DBADMIN may have a forced password change flag that blocks queries silently.
```sql
-- Run in SAP HANA Database Explorer (BTP cockpit)
ALTER USER DBADMIN PASSWORD "NewPassword#123" NO FORCE_FIRST_PASSWORD_CHANGE;
```

### Pages show empty data
Most likely a SQL compatibility issue between your HANA version and the query. Check the PM2 error log:
```bash
pm2 logs vynhana --err --lines 50
```
Look for `[hana] query error on <conn>:` entries. The error message will include the exact column name or view name that is unavailable.

### AI Copilot returns "No AI API key configured"
1. Go to **Settings** in the dashboard
2. Enter your Groq API key (free at [console.groq.com](https://console.groq.com))
3. Save. The key is stored in `data/settings.json`.

### Build fails on server
```bash
# Check the build log
ssh ubuntu@your-server "cat /tmp/build.log | tail -30"
```
Common causes: Node version mismatch (`node -v` must be 20+), missing `node_modules` (run `npm install` first).

### JWT errors / "Unauthorized" on all pages
The `JWT_SECRET` environment variable is not set or has changed. All existing sessions are invalidated when the secret changes.
```bash
# Set in PM2 ecosystem or shell
export JWT_SECRET=your-32-char-secret
pm2 restart vynhana --update-env
```

---

## Part of the VynOps Suite

| Product | Purpose | Repo |
|---|---|---|
| **VynOps** | Kubernetes operations platform | [vynops/VynOps](https://github.com/vynops/VynOps) |
| **VynAI** | Ollama fleet manager and AI gateway | [vynops/VynAI](https://github.com/vynops/VynAI) |
| **VynCost** | Cloud cost visibility | [vynops/VynCost](https://github.com/vynops/VynCost) |
| **VynDB** | Database operations | [vynops/VynDB](https://github.com/vynops/VynDB) |
| **VynDC** | Data center management | [vynops/VynDC](https://github.com/vynops/VynDC) |
| **VynCICD** | CI/CD pipeline management | [vynops/VynCICD](https://github.com/vynops/VynCICD) |
| **VynHana** | SAP HANA Database management | [vynops/VynHana](https://github.com/vynops/VynHana) |
| **VynSAP** | SAP ERP management | [vynops/VynSAP](https://github.com/vynops/VynSAP) |


---

## License

MIT — see [LICENSE](LICENSE)

---
