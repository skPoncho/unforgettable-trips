# Huella · web (Angular). La etapa `prod` (compilada y servida por Caddy) llega en la fase 9.
FROM node:24.22.2-slim AS base

ENV NG_CLI_ANALYTICS=false
WORKDIR /app

FROM base AS dev

COPY package.json package-lock.json ./
RUN npm ci && sha256sum package-lock.json > node_modules/.lock-hash

COPY docker-entrypoint.sh /usr/local/bin/
COPY . .

EXPOSE 4200
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npx", "ng", "serve", "--host", "0.0.0.0", "--port", "4200"]
