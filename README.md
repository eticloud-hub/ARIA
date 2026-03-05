# ARIA (AI-Rendered Intent Analyzer)

**Forensic Behavioral Attribution & Semantic Security Platform**

ARIA is a highly secure, multi-tenant digital forensics platform designed to process, analyze, and attribute malicious cyber behavior. Built with courtroom admissibility in mind, ARIA enforces strict chain-of-custody protocols, immutable audit trails, and zero-trust semantic analysis for AI agents.

## 🛡️ Core Philosophy

Standard security tools monitor *syntax* (bad code/packets). ARIA monitors *semantics* (bad intent). By combining heavy artifact processing (PCAP, EVTX) with AI-driven behavioral attribution, ARIA acts as a cognitive firewall and forensic analyzer. Because the platform handles sensitive legal and incident response data, **security, multi-tenant isolation, and data immutability are prioritized above all else.**

## ✨ Key Features

* **Legally Defensible Chain of Custody:** Server-side SHA-256 hashing for all uploaded artifacts. Client-side hashes are never trusted independently.
* **Airtight Tenant Isolation:** Enforced via PostgreSQL Row-Level Security (RLS). A user in Organization A mathematically cannot query data from Organization B.
* **Instant Token Revocation:** Custom JWT infrastructure using a `token_version` database claim, allowing immediate session termination across the platform (unlike standard stateless JWTs).
* **Immutable Audit Firehose:** Append-only, time-partitioned PostgreSQL audit logging (`audit_events`) that tracks every actor, IP, and entity change.
* **Transactional Outbox Pattern:** Guarantees reliable asynchronous job dispatching between the Node.js API and the Python worker queues using `FOR UPDATE SKIP LOCKED` concurrency controls.
* **Heavy Artifact Streaming:** PCAP and EVTX files are streamed directly to disk via Celery workers, bypassing Node.js memory limits.

## 🏗️ Architecture & Tech Stack

ARIA is built using a strict **Hexagonal Architecture (Ports & Adapters)** to decouple business logic from infrastructure.

* **Backend API:** Node.js, Express, TypeScript, custom Dependency Injection (DI) container.
* **Frontend:** React, Vite, Zustand (State Management), Tailwind CSS.
* **Database:** PostgreSQL 16 (Relational integrity, Range Partitioning, RLS).
* **Caching & Queues:** Redis (Lua-scripted sliding window rate limiters, Job queues).
* **Object Storage:** MinIO (S3-compatible, private buckets, short-TTL pre-signed URLs).
* **Processing Worker:** Python, Celery, `psycopg2` (Heavy forensics parsing).
* **Infrastructure:** Docker & Docker Compose.

## 📂 Project Structure

```text
ARIA/
├── backend/                # Node.js/Express API Gateway
│   ├── src/
│   │   ├── adapters/       # DB, Redis, and MinIO implementations
│   │   ├── db/             # Connection pools and SQL Migrations
│   │   ├── middleware/     # Auth (tv-claims), Rate Limiting, Error handling
│   │   ├── modules/        # Domain logic (Auth, Cases, Analysis)
│   │   ├── ports/          # Interfaces (StoragePort, QueuePort)
│   │   └── container.ts    # Dependency Injection root
├── frontend/               # React / Vite SPA
│   ├── src/
│   │   ├── components/     # React UI components
│   │   ├── lib/            # Axios API clients and interceptors
│   │   └── store/          # Zustand state management
├── worker/                 # Python Celery Workers
│   └── aria_worker/        # PCAP/EVTX parsing and HABD engine
└── docker-compose.yml      # Local development infrastructure

```

## 🚀 Getting Started (Local Development)

### Prerequisites

* Docker Desktop (running with WSL2 backend on Windows)
* Node.js (v18+)
* Python 3.10+

### 1. Boot the Infrastructure

Start the database, caching, and storage containers:

```bash
docker compose up -d postgres redis minio

```

### 2. Run Database Migrations

Ensure your database schema is up to date. (On Windows, use PowerShell to pipe the scripts to bypass the `<` restriction):

```bash
cd backend/src/db/migrations
Get-Content 003_partition_audit_events.sql | docker exec -i aria-postgres psql -U aria_admin -d aria
# ... run remaining migrations sequentially

```

### 3. Start the Backend API

```bash
cd backend
npm install
npm run dev

```

*The server will start on `http://localhost:3001`.*

### 4. Start the Frontend

In a new terminal window:

```bash
cd frontend
npm install
npm run dev

```

*The React app will start on `http://localhost:5173`. The Vite proxy is configured to route `/api` calls to port 3001.*

## 🔒 Security Posture & Known Constraints

This system was evaluated against high-threat models. Developers must adhere to the following:

1. **No direct table interpolation:** Repositories must use strict allowlists for table names to prevent SQL injection.
2. **Fail Closed:** Middleware (especially Auth) must *never* fail open if the database timeouts.
3. **No client-side trust:** The React frontend is considered a hostile environment. All RBAC and file validations must be redundantly verified by the Express backend.

---

*Built for the future of behavioral attribution.*
