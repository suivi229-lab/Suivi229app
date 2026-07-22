# ── Étape 1 : build Vite ─────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# npm 10.x a un bug "Exit handler never called!" — on utilise npm 9 (stable)
RUN npm install -g npm@9

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build

# ── Étape 2 : image de production légère ─────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# npm 9 stable aussi pour le runtime
RUN npm install -g npm@9

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY server.js package.json ./

EXPOSE 3000
ENV NODE_ENV=production

CMD ["node", "server.js"]
