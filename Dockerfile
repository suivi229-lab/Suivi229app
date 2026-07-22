# ── Étape 1 : build Vite ─────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN npm run build

# ── Étape 2 : image de production légère ─────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Copier uniquement ce qui est nécessaire au runtime
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY server.js package.json ./

EXPOSE 3000
ENV NODE_ENV=production

CMD ["node", "server.js"]
