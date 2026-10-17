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
├── compose.yaml                         # ローカル用 PostgreSQL（domain_a / domain_b）
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
│   └── domain-b-api/                    # ドメイン B（Order）の Cloud Run サービス（同じ構造）
├── infra/
│   ├── terraform/                       # 全ドメイン共通: 外部 HTTPS LB / Serverless NEG / Cloud Armor
│   └── local/                           # ローカル DB 初期化 SQL
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
ORDER_REPOSITORY=memory PORT=8081 pnpm dev:domain-b

# PostgreSQL で起動（dev スクリプトは各アプリの .env を読み込む）
docker compose up -d
cp apps/domain-a-api/.env.example apps/domain-a-api/.env   # PORT=8080, DB=domain_a
cp apps/domain-b-api/.env.example apps/domain-b-api/.env   # PORT=8081, DB=domain_b
pnpm --filter @app/domain-a-api exec prisma migrate deploy
pnpm --filter @app/domain-b-api exec prisma migrate deploy
pnpm dev:domain-a
pnpm dev:domain-b

curl -X POST localhost:8080/items -H 'content-type: application/json' \
  -d '{"name":"Coffee","description":"Hot","price":500}'
curl -X POST localhost:8081/orders -H 'content-type: application/json' \
  -d '{"itemId":"<item id>","quantity":2}'
curl -X POST localhost:8081/orders/<order id>/cancel
```

テスト / 型チェック（`pnpm build` 済みであること）:

```bash
pnpm test
pnpm typecheck
```

### API

| サービス     | Method | Path                 | 説明                                         |
| ------------ | ------ | -------------------- | -------------------------------------------- |
| domain-a-api | POST   | `/items`             | Item 作成（`name`, `description?`, `price`） |
| domain-a-api | GET    | `/items/:id`         | Item 取得                                    |
| domain-b-api | POST   | `/orders`            | 注文（`itemId`, `quantity`）                 |
| domain-b-api | GET    | `/orders/:id`        | 注文取得                                     |
| domain-b-api | POST   | `/orders/:id/cancel` | 注文キャンセル（二重キャンセルは 409）       |
| 共通         | GET    | `/healthz`           | Liveness / Startup probe                     |
| 共通         | GET    | `/readyz`            | DB 疎通確認                                  |

domain-b は Item の存在を domain-a の DB に直接問い合わせず、`itemId` を値として保持するだけです（ドメイン間の DB 共有をしない）。
存在確認が必要になったら、domain-b に `ItemCatalog` のようなポートを定義し、domain-a の API を呼ぶ HTTP アダプターで実装します。

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

```
Client ─HTTPS─▶ Global external ALB ─▶ URL map ─┬─ /items/*  ─▶ Backend(+Cloud Armor) ─▶ Serverless NEG ─▶ Cloud Run domain-a-api ─▶ AlloyDB (domain_a)
                (infra/terraform)               └─ /orders/* ─▶ Backend(+Cloud Armor) ─▶ Serverless NEG ─▶ Cloud Run domain-b-api ─▶ AlloyDB (domain_b)
```

適用順は **各アプリ（apps/*/terraform）→ 共通 LB（infra/terraform）** です。
アプリと LB の state は分離しており、LB 側は Cloud Run のサービス名だけを変数で受け取ります。

### 1. 各ドメインサービス（例: domain-a-api。domain-b-api も同じ手順）

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

`ingress = INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER` + `invoker_iam_disabled = true` により、LB（= Cloud Armor）を経由しない直接アクセスは拒否しつつ、LB 経由のリクエストは IAM 認証なしで受け付けます（`allUsers` への `run.invoker` 付与が不要なので、組織ポリシーの Domain Restricted Sharing にも抵触しません）。

### 2. 共通ロードバランサ + Cloud Armor（infra/terraform）

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # domains / services（パス → Cloud Run）を編集
cp backend.hcl.example backend.hcl
terraform init -backend-config=backend.hcl
terraform apply

# 出力された IP に DNS の A レコードを向けると、マネージド証明書が発行される（数十分かかる）
terraform output ip_address
```

作成されるリソース:

| リソース | 内容 |
| --- | --- |
| グローバル IP / 転送ルール（443, 80） | `EXTERNAL_MANAGED`（グローバル外部アプリケーション LB） |
| Target HTTPS proxy | Google マネージド SSL 証明書、SSL ポリシー（MODERN / TLS 1.2 以上） |
| URL map | `services[*].path_prefixes` によるパスベースルーティング（`/items`, `/items/*` → domain-a など） |
| HTTP → HTTPS リダイレクト | 80 番へのアクセスを 301 で HTTPS へ |
| Serverless NEG / Backend service | ドメインごとに 1 つ。リクエストログ有効 |
| Cloud Armor ポリシー | 事前構成 WAF（SQLi / XSS / LFI / RFI / RCE / スキャナ / プロトコル攻撃）、IP 単位のレート制限（超過で 429）、IP 拒否リスト、Adaptive Protection（L7 DDoS） |

WAF の誤検知が心配な場合は、導入初期に `waf_preview = true`（ログのみでブロックしない）で適用し、Cloud Logging で確認してから `false` にします。

## 新しいドメインを追加するには

1. `apps/domain-b-api` をコピーして `apps/domain-c-api` を作成し、`package.json` の `name` を変更
2. `prisma/schema.prisma` をドメイン C のモデルに書き換え（DB もドメインごとに分離）
3. `Dockerfile` の `apps/domain-b-api` / `@app/domain-b-api` を置換
4. `terraform/variables.tf` の `service_name` を `domain-c-api` に変更
5. `infra/terraform` の `services` に `domain-c = { cloud_run_service = "domain-c-api", path_prefixes = ["/..."] }` を追加
