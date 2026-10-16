# API image. Runs with environment variables only; see .env.example for the names.
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @licitatio/api --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY scripts scripts
RUN npm run build -w @licitatio/api

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @licitatio/api --omit=dev && npm cache clean --force
COPY --from=build /app/apps/api/dist apps/api/dist
# Roboto TTFs for PDF rendering; the process runs from apps/api so FONT_DIR defaults to ./assets/fonts
COPY apps/api/assets apps/api/assets
WORKDIR /app/apps/api
USER node
EXPOSE 8080
CMD ["node", "--max-old-space-size=384", "dist/server.js"]
