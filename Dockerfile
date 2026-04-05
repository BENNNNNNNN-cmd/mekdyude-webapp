FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Build the app
FROM base AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production image
FROM base AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built app
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy database files
COPY --from=builder --chown=nextjs:nodejs /app/db ./db
COPY --from=builder --chown=nextjs:nodejs /app/public/seed_data.json ./public/seed_data.json

# Create data directory for SQLite
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

EXPOSE 3000

CMD ["node", "server.js"]
