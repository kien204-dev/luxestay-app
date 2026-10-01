# Build context: repository root (the workspace lockfile lives there).
FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace apps/api

COPY apps/api apps/api

WORKDIR /app/apps/api
ENV NODE_ENV=production
EXPOSE 3001

ENTRYPOINT ["sh", "./docker-entrypoint.sh"]
