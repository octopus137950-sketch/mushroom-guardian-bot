# ============================================================
#  Mushroom Guardian Bot — Dockerfile
#  ใช้สำหรับ deploy บน Railway, Render, Fly.io หรือ VPS ใดก็ได้
# ============================================================

# ── Stage 1: Build ──────────────────────────────────────────
FROM node:24-slim AS builder

RUN npm install -g pnpm@10

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY tsconfig.base.json tsconfig.json ./
COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/
COPY scripts/ ./scripts/

# ติดตั้ง dependencies ทั้งหมด (รวม devDeps สำหรับ build + drizzle-kit)
RUN pnpm install --frozen-lockfile

# Build shared libs
RUN pnpm run typecheck:libs

# Build api-server (esbuild bundle)
RUN pnpm --filter @workspace/api-server run build

# ── Stage 2: Production ──────────────────────────────────────
FROM node:24-slim AS runner

RUN npm install -g pnpm@10

WORKDIR /app

# คัดลอก workspace config และ source สำหรับ drizzle-kit
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY tsconfig.base.json tsconfig.json ./
COPY lib/ ./lib/
COPY artifacts/api-server/package.json ./artifacts/api-server/

# คัดลอก node_modules ทั้งหมดจาก builder (รวม drizzle-kit สำหรับ db push)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/lib/db/node_modules ./lib/db/node_modules
COPY --from=builder /app/artifacts/api-server/node_modules ./artifacts/api-server/node_modules

# คัดลอก dist จาก builder stage
COPY --from=builder /app/artifacts/api-server/dist ./artifacts/api-server/dist

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+process.env.PORT+'/api/healthz', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# auto-migrate DB แล้วค่อยรัน server
CMD ["sh", "-c", "pnpm --filter @workspace/db run push && node --enable-source-maps artifacts/api-server/dist/index.mjs"]
