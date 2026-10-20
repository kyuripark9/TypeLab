# TypeLab in a container, for a host such as Railway (railway.json) or Fly.io: builds the React app, then runs the
# server on Node 24 (.nvmrc) with only the files it reads. The database and the free fonts kept beside it go on a
# persistent volume mounted at /data (DB_PATH below): a container's own disk is wiped on every deploy.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-slim
WORKDIR /app
# The host ends HTTPS in a proxy in front (TRUST_PROXY). One export worker: the pool would count the host's cores
# rather than the container's (server/export-pool.ts), and a worker keeps the letters it has rigged, so after a
# six-style family in an own font the server held about 750 MB with one and 1.4 GB with two, as quick. A host that
# bills memory in use pays for each; set EXPORT_WORKERS higher there for big families asked for side by side.
# PORT is the host's to set (Railway does); PUBLIC_URL, Google's keys and SMTP_URL/MAIL_FROM are set on the host too.
ENV NODE_ENV=production DB_PATH=/data/typelab.db TRUST_PROXY=1 EXPORT_WORKERS=1
COPY --from=build /app/package.json /app/tsconfig.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/dist dist
COPY --from=build /app/server server
COPY --from=build /app/shared shared
COPY --from=build /app/fonts fonts
# node itself rather than npm start, so the host's SIGTERM reaches the server and it closes the database first
CMD ["node", "--import", "tsx", "server/index.ts"]
