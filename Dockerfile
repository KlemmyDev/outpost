# syntax=docker/dockerfile:1
# Outpost: one image, built on the host from the git checkout by install.sh.
# No registry: every install builds the exact commit it's on.

FROM node:24-slim AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:24-slim
# The commit this image was built from. install.sh passes it in; the app
# compares it with GitHub to know whether an update is available.
ARG GIT_COMMIT=""
ENV NODE_ENV=production \
    GIT_COMMIT=${GIT_COMMIT} \
    DATA_DIR=/data \
    HOST=0.0.0.0 \
    PORT=3000 \
    NODE_OPTIONS=--disable-warning=ExperimentalWarning
WORKDIR /app
COPY --from=build /src/.output ./.output
COPY package.json ./
COPY docker/ ./docker/
RUN chmod +x docker/entrypoint.sh
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=60s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
ENTRYPOINT ["/app/docker/entrypoint.sh"]
CMD ["node", ".output/server/index.mjs"]
