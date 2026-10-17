# multiple-domain-app-sample

Cloud Run 上で **ドメイン単位にサービスを分割** する TypeScript モノレポのサンプルです。

- Web: Express 5 / ORM: Prisma 6 / DB: PostgreSQL（AlloyDB 互換）
- pnpm workspace によるモノレポ
- 各アプリはヘキサゴナルアーキテクチャ（Ports and Adapters）
- IaC: Terraform（アプリごとに `terraform/` を持つ）

## ディレクトリ構成

```
.
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
├── compose.yaml                         # ローカル用 PostgreSQL
├── apps/
│   └── domain-a-api/                    # ドメイン A（Item）の Cloud Run サービス
│       ├── Dockerfile                   # ビルドコンテキストはリポジトリルート
│       ├── prisma/
│       │   ├── schema.prisma            # ドメイン A 専用スキーマ（生成先: generated/prisma）
│       │   └── migrations/
│       ├── src/
│       │   ├── domain/                  # エンティティ（Item）: 外部依存なし
│       │   ├── application/
│       │   │   ├── ports/               # ItemRepository インターフェース
│       │   │   └── usecases/            # CreateItemUseCase / GetItemUseCase
│       │   ├── infrastructure/
│       │   │   ├── config/              # 環境変数の読み込み
│       │   │   ├── repositories/        # PrismaItemRepository / InMemoryItemRepository
│       │   │   └── web/                 # Express ルーター・エラーハンドラ
│       │   └── index.ts                 # Composition Root（DI と起動）
│       ├── test/                        # ユースケース / HTTP のテスト（DB 不要）
│       └── terraform/                   # Artifact Registry / Cloud Run v2 / Secret / 移行 Job
└── packages/
    ├── core-domain/                     # 共通ドメイン抽象（DomainError, Entity, Brand, Clock, IdGenerator）
    └── database-common/                 # Prisma クライアント生成, DATABASE_URL 解決, Prisma エラー変換
```

### 依存の向き

```
infrastructure (Express, Prisma)  ──▶  application (usecases, ports)  ──▶  domain
            │                                                               ▲
            └──────────────── implements ports ─────────────────────────────┘
```

- `domain` / `application` は Express や Prisma を import しない。
- `index.ts` だけが具体クラスを知っており、`PrismaItemRepository`（または `InMemoryItemRepository`）を `ItemRepository` ポートとしてユースケースに注入する。
- ドメインエラー（`ValidationError` / `NotFoundError` / `ConflictError`）は Web アダプターの `errorHandler` で 400 / 404 / 409 に変換する。

### Prisma Client をアプリごとに生成する理由

pnpm workspace では `@prisma/client` が全アプリで共有されるため、デフォルトの生成先（`node_modules/.prisma/client`）だとドメイン同士で生成物を上書きしてしまいます。
そのため `schema.prisma` の `output = "../generated/prisma"` でアプリ配下に生成し、`src` と `dist` のどちらからも `../generated/prisma` で参照できるようにしています。

## ローカル開発

```bash
pnpm install
pnpm build                     # packages/* の tsc → apps/* の prisma generate + tsc

# DB なしで起動（インメモリリポジトリ）
ITEM_REPOSITORY=memory pnpm dev:domain-a

# PostgreSQL で起動
docker compose up -d
cp apps/domain-a-api/.env.example apps/domain-a-api/.env
pnpm --filter @app/domain-a-api exec prisma migrate deploy
pnpm dev:domain-a

curl -X POST localhost:8080/items -H 'content-type: application/json' \
  -d '{"name":"Coffee","description":"Hot","price":500}'
curl localhost:8080/items/<id>
```

テスト / 型チェック（`pnpm build` 済みであること）:

```bash
pnpm test
pnpm typecheck
```

### API

| Method | Path         | 説明                                   |
| ------ | ------------ | -------------------------------------- |
| POST   | `/items`     | Item 作成（`name`, `description?`, `price`） |
| GET    | `/items/:id` | Item 取得                              |
| GET    | `/healthz`   | Liveness / Startup probe               |
| GET    | `/readyz`    | DB 疎通確認                            |

## コンテナビルド

ビルドコンテキストは **リポジトリルート** です（lockfile と共通パッケージが必要なため）。

```bash
# API 本体（runtime ステージ）
docker build -f apps/domain-a-api/Dockerfile -t domain-a-api .
# マイグレーション用（prisma CLI 入り）
docker build -f apps/domain-a-api/Dockerfile --target migrate -t domain-a-api-migrate .
```

Dockerfile の流れ:

1. `pnpm fetch` で lockfile のみから依存を取得（ソース変更でキャッシュが壊れない）
2. 対象アプリと `packages/` だけをコピーし `pnpm install --filter "@app/domain-a-api..."`
3. `pnpm --filter "@app/domain-a-api..." build` で共通パッケージ → `prisma generate` → `tsc`
4. `pnpm deploy --prod` で本番依存だけの自己完結ディレクトリを作成（`.npmrc` の `inject-workspace-packages=true` で共通パッケージを実体コピー）
5. `node:22-bookworm-slim` に成果物だけを載せ、非 root ユーザー + tini で起動

## デプロイ（Terraform）

```bash
cd apps/domain-a-api/terraform
cp terraform.tfvars.example terraform.tfvars   # project_id などを編集
cp backend.hcl.example backend.hcl
terraform init -backend-config=backend.hcl

# 1. Artifact Registry と Secret を先に作成
terraform apply -target=google_artifact_registry_repository.this -target=google_secret_manager_secret.database_url

# 2. DB 接続文字列を登録（state に秘密情報を残さない）
echo -n 'postgresql://user:pass@10.x.x.x:5432/domain_a?schema=public' \
  | gcloud secrets versions add domain-a-api-database-url --data-file=-

# 3. イメージを push
REPO=$(terraform output -raw artifact_registry_image_base)
docker build -f ../Dockerfile -t $REPO/domain-a-api:v1 ../../..
docker build -f ../Dockerfile --target migrate -t $REPO/domain-a-api-migrate:v1 ../../..
docker push $REPO/domain-a-api:v1 && docker push $REPO/domain-a-api-migrate:v1

# 4. Cloud Run サービス / 移行 Job を作成し、マイグレーション実行
terraform apply -var image_tag=v1
gcloud run jobs execute domain-a-api-migrate --region asia-northeast1 --wait
```

作成されるリソース: Artifact Registry（クリーンアップポリシー付き）、実行用サービスアカウント、Secret Manager シークレット（`DATABASE_URL`）、Cloud Run v2 サービス（プローブ / スケーリング / Direct VPC Egress 任意）、マイグレーション用 Cloud Run Job。

`ingress` のデフォルトは `INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER` で、外部 HTTPS LB + Cloud Armor 経由でのみ到達できる想定です（LB / Serverless NEG / Cloud Armor ポリシーは複数ドメインで共有するため、別の共通 Terraform で管理することを推奨）。

## 新しいドメインを追加するには

1. `apps/domain-a-api` をコピーして `apps/domain-b-api` を作成し、`package.json` の `name` を変更
2. `prisma/schema.prisma` をドメイン B のモデルに書き換え（DB またはスキーマもドメインごとに分離）
3. `Dockerfile` の `apps/domain-a-api` / `@app/domain-a-api` を置換
4. `terraform/` の `service_name` を `domain-b-api` に変更
