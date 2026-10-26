# apps/web/Dockerfile — built with repo root as context (see infra/docker-compose.yml):
# src/features/*/types.ts import packages/shared-types via a relative path.
FROM node:22-slim
WORKDIR /app/apps/web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci
COPY apps/web/ ./
COPY packages/shared-types/ ../../packages/shared-types/
RUN npm run build
CMD ["npm", "run", "preview"]
