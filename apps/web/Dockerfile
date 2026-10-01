# Build context: repository root (the workspace lockfile lives there).
FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace apps/web

COPY apps/web apps/web

# Vite inlines these at build time. "/api" means "same origin", which is how
# the bundled nginx serves it.
ARG VITE_API_URL=/api
ARG VITE_APP_NAME=LuxeStay
# Optional Google sign-in (web API keys, not secrets). Empty = button disabled.
ARG VITE_FIREBASE_API_KEY=
ARG VITE_FIREBASE_AUTH_DOMAIN=
ARG VITE_FIREBASE_PROJECT_ID=
ARG VITE_FIREBASE_STORAGE_BUCKET=
ARG VITE_FIREBASE_MESSAGING_SENDER_ID=
ARG VITE_FIREBASE_APP_ID=
ENV VITE_API_URL=$VITE_API_URL     VITE_APP_NAME=$VITE_APP_NAME     VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY     VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN     VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID     VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET     VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID     VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID
RUN npm run build --workspace apps/web

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
