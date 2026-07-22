# ── Étape 1 : build Vite ─────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Variables Vite disponibles au moment du build (intégrées dans le bundle JS)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

# Forcer le registry public npm (package-lock.json Replit contient des URLs internes)
RUN npm config set registry https://registry.npmjs.org

# Copier package.json uniquement (pas le lock — ses resolved URLs sont Replit-only)
COPY package.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build

# ── Étape 2 : image de production légère ─────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY server.js package.json ./

EXPOSE 3000
ENV NODE_ENV=production

CMD ["node", "server.js"]
