# syntax=docker/dockerfile:1.7
#
# domain-b-api 用マルチステージビルド。
# ビルドコンテキストは「リポジトリルート」（pnpm workspace 全体の lockfile と共通パッケージが必要なため）。
#
#   docker build -f apps/domain-b-api/Dockerfile -t domain-b-api .
#   docker build -f apps/domain-b-api/Dockerfile --target migrate -t domain-b-api-migrate .
#
ARG NODE_VERSION=22

# ---------------------------------------------------------------------------
# base: pnpm と Prisma エンジン実行に必要な OpenSSL を入れた共通イメージ
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# package.json の packageManager に固定された pnpm を使う
RUN corepack enable
WORKDIR /repo

# ---------------------------------------------------------------------------
# build: 依存インストール -> prisma generate -> tsc -> 本番用ディレクトリの切り出し
# ---------------------------------------------------------------------------
FROM base AS build

# 1) lockfile だけで依存を取得（ソース変更時もこのレイヤーはキャッシュが効く）
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch --frozen-lockfile

# 2) 対象アプリとそれが依存する共通パッケージのみコピー（他ドメインの変更でキャッシュを壊さない）
COPY tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/domain-b-api/ ./apps/domain-b-api/

# 3) "@app/domain-b-api..." = 本アプリと、その依存ワークスペースパッケージだけをインストール/ビルド
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline --filter "@app/domain-b-api..."
# packages/* の tsc と、アプリの prisma generate + tsc がトポロジカル順に実行される
RUN pnpm --filter "@app/domain-b-api..." build

# 4) 本番依存のみを持つ自己完結ディレクトリを /out に作成
#    （workspace:* の共通パッケージは .npmrc の inject-workspace-packages により実体コピーされる）
#    package.json の "files"（dist / generated / prisma）が含まれる
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @app/domain-b-api deploy --prod --offline /out

# ---------------------------------------------------------------------------
# migrate: `prisma migrate deploy` を実行するイメージ（Cloud Run Jobs 等で実行する想定）
# ---------------------------------------------------------------------------
FROM build AS migrate
WORKDIR /repo/apps/domain-b-api
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

# ---------------------------------------------------------------------------
# runtime: Cloud Run で動かす最小イメージ（pnpm / devDependencies / ソースは含まない）
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=8080
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 8080
# tini を PID 1 にして SIGTERM を Node.js に確実に届ける（graceful shutdown のため）
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.js"]
