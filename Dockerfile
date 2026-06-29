# ============================================================
#  Mushroom Guardian Bot — Dockerfile
#  ใช้สำหรับ deploy บน Railway, Render, Fly.io หรือ VPS ใดก็ได้
# ============================================================

# ── Stage 1: Build ──────────────────────────────────────────
FROM node:24-slim AS builder

# ติดตั้ง pnpm
RUN npm install -g pnpm@10

WORKDIR /app

# คัดลอก workspace config ก่อนเพื่อใช้ cache layer ได้ดีขึ้น
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY tsconfig.base.json tsconfig.json ./

# คัดลอก lib และ artifacts source
COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/
COPY scripts/ ./scripts/

# ติดตั้ง dependencies ทั้งหมด (รวม devDependencies สำหรับ build)
RUN pnpm install --frozen-lockfile

# Build shared libs ก่อน (typecheck + emit declarations)
RUN pnpm run typecheck:libs

# Build api-server (esbuild bundle)
RUN pnpm --filter @workspace/api-server run build

# ── Stage 2: Production ──────────────────────────────────────
FROM node:24-slim AS runner

RUN npm install -g pnpm@10

WORKDIR /app

# คัดลอก workspace config (สำหรับ runtime dependencies)
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY lib/ ./lib/
COPY artifacts/api-server/package.json ./artifacts/api-server/

# ติดตั้งเฉพาะ production dependencies
RUN pnpm install --frozen-lockfile --prod

# คัดลอก dist จาก builder stage
COPY --from=builder /app/artifacts/api-server/dist ./artifacts/api-server/dist

# กำหนด environment
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+process.env.PORT+'/api/healthz', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# รันบอท + API server
CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
