# olomol in a container: the site built with Node, then served by nginx
# behind a password (HTTP Basic Auth; the password is given at start).
#   docker build -t olomol .
#   docker run -d --name olomol -p 8080:80 -e OLOMOL_PASSWORD='choose one' olomol
# More in docs/hosting.md.

# 1. Build the site: the same as `npm ci && npm run build` (Node as in .nvmrc)
FROM docker.io/library/node:24.22.0-alpine3.24 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# 2. Serve it: only nginx and the built files
FROM docker.io/library/nginx:1.30.6-alpine3.24
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/40-olomol-password.sh /docker-entrypoint.d/40-olomol-password.sh
RUN chmod 755 /docker-entrypoint.d/40-olomol-password.sh
COPY --from=build /app/dist /usr/share/nginx/html
HEALTHCHECK --interval=60s --timeout=5s CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
