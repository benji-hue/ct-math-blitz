# «Крок» на своём сервере: мини-апп, API с ИИ, Telegram-бот и напоминания в одном контейнере.
# Это тот же код, что в Cloudflare Workers (worker/src), только запущенный в Node.js (worker/node).
# Собирает и выкладывает GitHub Actions (.github/workflows/deploy-server.yml); вручную:
#   docker build -t krok .

FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY worker/package.json worker/package-lock.json worker/
RUN npm ci --prefix worker --no-audit --no-fund
COPY . .
ARG VITE_BOT_USERNAME=PFPFISJFOIJBOT
ENV VITE_BOT_USERNAME=$VITE_BOT_USERNAME
RUN npm run build:pwa && npm run build:server --prefix worker

FROM node:24-slim
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data APP_ROOT=/app
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/worker/dist-server/server.mjs ./server.mjs
COPY --from=build /app/worker/migrations ./migrations
COPY --from=build /app/worker/wrangler.jsonc ./wrangler.jsonc
# База (SQLite) живёт в томе /data и переживает обновления контейнера.
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "server.mjs"]
