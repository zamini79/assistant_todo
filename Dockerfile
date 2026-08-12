# Next.js standalone 컨테이너.
#
# Render 배포에 쓰지만 플랫폼 종속 요소가 없다 — 최종 목표인 AWS ECS에도 그대로 올라간다.
#
# 빌드 시점에 비밀키가 필요 없다는 점이 중요하다. 이 앱은 Supabase 키를 서버 코드에서만
# 읽고, Next.js는 서버 번들에서 process.env 접근을 런타임까지 남겨두기 때문에
# 이미지에는 어떤 크리덴셜도 굽히지 않는다. 전부 실행 시 주입한다.

# ── 1) 의존성 ──────────────────────────────────────────────
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── 2) 빌드 ────────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# next/font가 빌드 중 폰트를 내려받아 번들에 넣는다 (런타임 외부 요청 없음).
RUN npm run build

# ── 3) 실행 ────────────────────────────────────────────────
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# root로 돌지 않는다.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
# standalone 산출물에는 server.js와 실행에 필요한 최소 node_modules만 들어있다.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
