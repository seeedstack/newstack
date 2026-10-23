# apps/ingestion/Dockerfile — built with repo root as context (see infra/docker-compose.yml):
# config.py resolves config/ two directories above itself (the repo root).
FROM python:3.11-slim
WORKDIR /app/apps/ingestion
COPY apps/ingestion/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY apps/ingestion/ .
COPY config/ ../../config/
CMD ["python", "-m", "workers.scheduler"]
