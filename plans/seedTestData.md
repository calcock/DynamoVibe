# Seed Test Data — Local DynamoDB

## Goal

Provide a script that connects to local DynamoDB (dynamodb-local), creates 4
sample tables, and populates each with at least 100 rows of sample data — so the
Dynamite GUI has realistic, browsable data to work against.

## What was built

- **`scripts/seed-local.mjs`** — standalone Node ESM script (no build step).
  Uses the project's existing AWS SDK v3 deps (`@aws-sdk/client-dynamodb`,
  `@aws-sdk/lib-dynamodb`).
- **`package.json`** — added `"seed:local": "node scripts/seed-local.mjs"`.

## Tables created

| Table            | Key schema                          | Rows | Sample attributes                                                      |
| ---------------- | ----------------------------------- | ---- | --------------------------------------------------------------------- |
| `SampleUsers`    | `userId` (HASH)                     | 120  | email, fullName, age, country, isActive, loyaltyPoints, tags[], createdAt |
| `SampleProducts` | `productId` (HASH)                  | 100  | name, category, price, inStock, rating, sku, featured                 |
| `SampleOrders`   | `userId` (HASH) + `orderId` (RANGE) | 150  | status, total, lineItems[] (nested maps), placedAt                    |
| `SampleReviews`  | `productId` (HASH) + `reviewId` (RANGE) | 200 | userId, rating, comment, verifiedPurchase, helpfulVotes              |

Data is cross-referenced (orders reference user/product IDs, reviews reference
product/user IDs) and includes varied DynamoDB types — nested maps, lists,
booleans, numbers — to exercise the GUI's tree/JSON editors.

## Behavior / design notes

- Connects to `http://localhost:8000` by default; override via env `DDB_ENDPOINT`
  and `AWS_REGION`.
- All tables use `PAY_PER_REQUEST` billing, no GSIs.
- **Re-runnable**: each table is dropped (if present) and recreated, then polled
  until `ACTIVE`, for a clean reseed every run.
- Writes via `BatchWriteCommand` (25 items/batch) with `UnprocessedItems` retry.
- Row counts and keys are stable across runs, but attribute *values* use
  `Math.random()`, so they differ between runs.

## How to run

```bash
docker compose up -d         # start dynamodb-local on :8000
npm run seed:local           # or: node scripts/seed-local.mjs
```

## Verified

Ran successfully against local DynamoDB on 2026-06-21 — created all 4 tables and
wrote 120 / 100 / 150 / 200 items respectively.

## Possible follow-ups (not done)

- Make data fully deterministic with a seeded RNG.
- Add GSIs to demo secondary-index browsing in the GUI.
