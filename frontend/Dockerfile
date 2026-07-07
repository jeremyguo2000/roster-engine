# Production image for the frontend. Build from frontend/:
#   docker build -t roster-frontend:<tag> ./frontend
#
# Stage 1 compiles the React app to static files; stage 2 serves them with
# nginx, which also proxies /api, /documentation and /mcp to the backend
# services (replacing the Vite dev proxy). The proxy targets come from the
# BACKEND_URL and MCP_URL env vars, substituted into the nginx config at
# container start by the stock nginx entrypoint.
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Unprivileged variant runs as non-root and listens on 8080.
FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

# Defaults match the Helm chart's service names; overridden per-release.
ENV BACKEND_URL=http://roster-engine-backend:8000 \
    MCP_URL=http://roster-engine-mcp:8000

EXPOSE 8080
