# Plan: Cross-Platform Desktop DynamoDB Client

## Context

There is no existing tool in this project — this is a greenfield build. The goal is a
desktop GUI client for Amazon DynamoDB that runs on **Windows and macOS** and lets a
developer:

- Connect to both **local DynamoDB** (custom endpoint) and **remote AWS** accounts.
- **Browse** table data in a fast, schemaless-aware grid.
- **Edit items** via a structured GUI editor *and* a raw JSON editor.
- **Create tables and secondary indexes**.
- **Query and Scan** with flexible criteria, plus PartiQL.

All technology and UX decisions below were settled with the user during a grilling session.

## Stack (decided)

| Concern | Choice |
|---|---|
| Shell | **Electron** (AWS SDK runs in the **main process**, renderer calls via IPC) |
| UI | **React + TypeScript** |
| Build/dev | **electron-vite** (HMR) + **electron-builder** (Win NSIS + macOS dmg) |
| Server state | **TanStack Query** (caching, pagination, loading) |
| UI state | **Zustand** |
| Components | **Mantine** (shell, forms, modals, notifications, dark mode) |
| Data grid | **TanStack Table** (headless) + virtualization |
| Editors | **Monaco** for raw JSON + PartiQL |
| AWS | `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `@aws-sdk/util-dynamodb`, `@aws-sdk/credential-providers` |
| Secrets | OS keychain via Electron **`safeStorage`**; connection defs in **electron-store** (userData) |
| Local DB (dev/test) | **amazon/dynamodb-local** in Docker |
| Tests | **aws-sdk-client-mock** (unit) + dynamodb-local (integration) |

## Architecture

```
electron main (Node)                 renderer (React)
├─ connection manager                ├─ App shell: sidebar + tabbed workspace
│   ├─ credential resolution         ├─ Connections panel
│   │   • named profiles + SSO       ├─ Table workspace tabs:
│   │   • manual keys (safeStorage)  │   • Browse (TanStack grid)
│   ├─ region + endpoint per conn    │   • Query (guided builder + PartiQL)
│   └─ read-only flag + env label    │   • Item editor (tree + raw JSON toggle)
├─ DynamoDB service (per connection) │   • Indexes / table settings
│   ├─ describe/list/create table    └─ TanStack Query hooks → IPC
│   ├─ scan / query (paginated)
│   ├─ get/put/update/delete item
│   └─ executeStatement (PartiQL)
└─ IPC handlers (typed channels)
```

- **Credentials never enter the renderer.** Renderer sends a `connectionId` + operation
  args over IPC; main resolves credentials and runs the SDK call.
- One `DynamoDBClient` + `DynamoDBDocumentClient` cached per active connection.

## Connections

- **Auth modes:** (a) pick a **named profile** from `~/.aws/config|credentials` (SDK
  credential provider chain handles static keys, **SSO**, assume-role); (b) **manual
  Access Key / Secret / optional Session Token** form, encrypted via `safeStorage` and
  stored in the keychain — never plaintext.
- **Local DynamoDB:** custom **endpoint URL** (e.g. `http://localhost:8000`) + dummy creds.
- Per connection: **region**, **read-only toggle**, **environment label + color**
  (e.g. prod=red banner, local=green).

## Data representation

- Display uses the **document form** (`{"name":"Bob","age":30}`) by default.
- Raw JSON editor has a **toggle between document form and typed wire format**
  (`{"name":{"S":"Bob"}}`).
- Round-trips are **lossless**: explicit handling of **Sets (SS/NS/BS), Binary, NULL, and
  Number precision** (preserve as strings/BigInt where needed) rather than naive
  `marshall`/`unmarshall`. This conversion util is the highest-risk code — unit-test it
  hard with property-style round-trip cases.

## Feature details

**Browse grid**
- Columns = union of attributes in the loaded page; **PK/SK pinned** first.
- Virtualized rows; nested Map/List shown collapsed with JSON preview, expandable.
- Pagination via **`LastEvaluatedKey`** cursor ("Load more" + page model).
- Row actions: open in item editor, duplicate, delete (confirm dialog).

**Query / Scan**
- *Guided builder:* pick table/index, Query vs Scan, `PK = value`, optional SK condition
  (`=`, `begins_with`, `between`, `>`, `<`), additional filter expressions (attribute
  conditions, AND/OR). We generate `KeyConditionExpression`/`FilterExpression` +
  `ExpressionAttributeNames/Values` and show the generated expression read-only.
- *PartiQL tab:* Monaco editor → `ExecuteStatement`, with a clear warning when a statement
  resolves to a full scan.

**Item editor**
- **Tree editor:** each node has key, **type selector** (S, N, BOOL, NULL, M, L, SS, NS,
  BS, B), and a type-appropriate value input; add/remove/reorder; arbitrary nesting.
- **Raw JSON toggle** stays live-synced with the tree.
- Save = `PutItem`; **conditional-write awareness**: warn on overwrite, offer
  "only if not exists" / version-check via `ConditionExpression`.

**Table / index management**
- Create table: name, PK/SK + types, billing mode (**on-demand default**, or provisioned
  RCU/WCU), **GSIs/LSIs** (key schema + projection type).
- Edit existing table: add/remove GSIs, toggle billing. (TTL/streams deferred.)

**Safety**
- Read-only connections disable all write/create/delete UI.
- Environment color banner always visible in the active workspace.
- Confirm dialogs on delete-item and drop-table naming the exact target.

## Suggested build order

1. **Project skeleton** — electron-vite + React + TS, Mantine, typed IPC scaffold,
   electron-builder config for Win/macOS.
2. **Connection model** — store, credential resolution (profiles/SSO + manual/safeStorage),
   local endpoint, read-only + env label; connections sidebar.
3. **Marshalling util** + tests (the lossless type layer).
4. **Browse grid** — list/describe tables, scan with pagination, TanStack grid.
5. **Item editor** — tree editor + raw JSON toggle + save with conditional writes.
6. **Query/Scan** — guided builder + generated expression; then PartiQL tab.
7. **Table/index create + edit**.
8. **Safety polish** — confirms, banners, read-only enforcement end-to-end.
9. **Packaging** — signed-ish builds (note: real code-signing/notarization optional later).

## Verification

- **Unit:** marshalling round-trip (every DynamoDB type incl. Sets/Binary/Number
  precision); expression generation from the guided builder; SDK calls with
  `aws-sdk-client-mock`.
- **Integration:** spin up `amazon/dynamodb-local` in Docker; create table, put/query/scan/
  update/delete; assert grid pagination via `LastEvaluatedKey`.
- **Manual E2E:** point the app at dynamodb-local (green/local label), create a table with a
  GSI, insert items via both tree and raw editors, run a guided query and a PartiQL query,
  toggle read-only and confirm writes are blocked. Then connect a real AWS profile (read-only
  first) and browse a table.
- **Build check:** `electron-builder` produces a Windows `.exe` (NSIS) and macOS `.dmg` that
  launch on each OS.

## Deferred (explicitly out of scope for v1)

TTL config, DynamoDB Streams, KMS/encryption settings, tags, deletion protection,
auto-scaling, saved per-table column views, batch/import-export. All are additive later.
