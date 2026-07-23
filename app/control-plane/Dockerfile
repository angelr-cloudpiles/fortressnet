FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=80

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY --from=build /app/dist ./dist

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1

CMD ["node", "server.js"]
