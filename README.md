# Newstack

A news-aggregation platform: story clustering, source bias/factuality tagging, blindspot
detection, and personalization over Indian news sources.

## Monorepo layout

```
apps/
  ingestion/   Python — fetch, canonicalize, embed, cluster, baseline/ratings jobs (APScheduler)
  api/         Node/TS (Fastify) — auth, feed/story/topic/rating/saved/curator REST API
  web/         React 18 + TS (Vite) — the frontend
packages/
  shared-types/  TS types generated from the OpenAPI spec (openapi-typescript)
config/        YAML config for clustering, embedding input, product/blindspot params, sources
infra/         docker-compose, Postgres migrations, migration runner
validation/    tests that validate the SQL/logic embedded in the project's spec
```

## Prerequisites

- Docker + Docker Compose (easiest path — runs everything below for you), **or**
- Node.js 20+, Python 3.11+, PostgreSQL 16 with `pgvector`, Redis 7, for running apps locally
  without containers.

## Install & run (Docker Compose — recommended)

```bash
cd infra
docker compose up --build
```

This starts Postgres (pgvector), Redis, the ingestion worker, the API, the mailer process, and
the web frontend. Apply migrations once the db is healthy:

```bash
DATABASE_URL=postgresql://newstack:newstack@localhost:5432/newstack python infra/migrate.py
```

Then:

- Web app: http://localhost:5173
- API: http://localhost:3000 (health check at `/health`)

All services use insecure dev-default secrets (JWT key, curator API key, cursor-signing key) when
their env vars are unset — fine for local dev, **never for production**. See `apps/api/src/config.ts`,
`features/auth/jwt.ts`, `pagination.ts`, and `plugins/curator.ts` for the env vars to override
(`JWT_KEYS`, `CURATOR_API_KEY`, `CURSOR_KEYS`, `RESEND_API_KEY`/`MAIL_FROM` for real email).

## Install & run (without Docker)

**Database**

```bash
# Postgres 16 with pgvector running locally, then:
DATABASE_URL=postgresql://newstack:newstack@localhost:5432/newstack python infra/migrate.py
```

**`apps/api`**

```bash
cd apps/api
npm install
npm run dev     # tsx watch, http://localhost:3000
```

**`apps/web`**

```bash
cd apps/web
npm install
npm run dev      # Vite dev server, http://localhost:5173
```

**`apps/ingestion`**

```bash
cd apps/ingestion
pip install -r requirements.txt
python -m service         # scheduler/orchestration entrypoint
python -m cli.story_browser  # inspect clustered stories from the CLI
```

**`packages/shared-types`**

```bash
cd packages/shared-types
npm install
npm run generate   # regenerate src/openapi.ts from the OpenAPI spec
```

## Running tests

```bash
cd apps/api && npm test          # Vitest
cd apps/web && npm test          # Vitest
cd apps/ingestion && pytest      # pytest
```

## Validation suite

`validation/` checks the SQL and logic embedded in this project's spec directly — nothing here is
committed generated code; it's re-extracted from the spec on every run (see `validation/run_all.sh`
and `validation/README.md`).

The DB suite needs PostgreSQL 16 binaries at `/usr/lib/postgresql/16/bin` (Linux-oriented; this is
what CI uses).

