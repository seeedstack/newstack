# apps/api/Dockerfile — built with repo root as context (see infra/docker-compose.yml):
# src/features/blindspot/config.ts resolves config/ at the repo root via a relative path.
FROM node:22-slim
WORKDIR /app/apps/api
COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm ci
COPY apps/api/ ./
COPY config/ ../../config/
RUN npm run build
CMD ["npm", "start"]
