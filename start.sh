#!/usr/bin/env bash
# One-click local startup: db/redis -> migrations -> api/ingestion/mailer/web.
# Requires Docker + Docker Compose only (see README "Install & run (Docker Compose)").
set -euo pipefail
cd "$(dirname "$0")/infra"

echo "==> starting db + redis, applying migrations"
docker compose run --rm \
  -e DATABASE_URL="postgresql://newstack:newstack@db:5432/newstack" \
  -v "$(pwd)/..:/workspace" \
  --entrypoint python \
  ingestion /workspace/infra/migrate.py

echo "==> starting api, ingestion, mailer, web"
docker compose up --build -d

echo
echo "web:  http://localhost:5174"
echo "api:  http://localhost:3000/health"
echo "logs: cd infra && docker compose logs -f"
