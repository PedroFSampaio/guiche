FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY . .
RUN npm ci && npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    GUICHE_DIST_DIR=.next-local \
    GUICHE_DATA_DIR=/app/.local-data
COPY --from=build /app ./
RUN mkdir -p /app/.local-data
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
