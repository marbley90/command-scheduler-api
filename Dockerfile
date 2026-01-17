# ---- deps ----
FROM node:20-alpine AS deps
WORKDIR /app

# Install dependencies (cache-friendly)
COPY package*.json ./
RUN npm ci

# ---- test ----
FROM node:20-alpine AS test
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY src ./src
COPY test ./test

# Run unit + e2e tests (fail build if failing)
ENV NODE_ENV=test
RUN npm run test -- --runInBand
RUN npm run test:e2e -- --runInBand

# ---- build ----
FROM node:20-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY src ./src

RUN npm run build

# ---- runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Only production deps
COPY package*.json ./
RUN npm ci --omit=dev

# Copy build output
COPY --from=build /app/dist ./dist

# SQLite DB persistence directory (mounted via compose)
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "dist/main.js"]
