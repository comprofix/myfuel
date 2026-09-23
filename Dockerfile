# ---- build the React front end ----
FROM node:24-alpine AS web
WORKDIR /src
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
# Only the web workspace's dependencies; root dev tools aren't needed to build
RUN npm ci -w web
COPY web web
RUN npm run build -w web

# ---- runtime: Node runs the TypeScript server directly (type stripping) ----
FROM node:24-alpine
ENV NODE_ENV=production TZ=Australia/Sydney
RUN apk add --no-cache tzdata
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev -w server && npm cache clean --force
COPY server server
COPY --from=web /src/web/dist web/dist
USER node
WORKDIR /app/server
EXPOSE 8080
CMD ["node", "src/index.ts"]
