# Dynamite

A cross-platform (Windows + macOS) desktop GUI client for Amazon DynamoDB, built
with Electron + React + TypeScript.

## Features

- **Connections** — local DynamoDB (custom endpoint), AWS named profiles / SSO, or
  manual access keys. Manual keys are encrypted in the OS keychain (Electron
  `safeStorage`); connection definitions live in `electron-store`. Each connection
  carries a **region**, an **environment label** (colour-coded banner), and a
  **read-only** flag.
- **Browse** — virtualized grid (TanStack Table) with dynamic columns (PK/SK pinned),
  `LastEvaluatedKey` pagination ("Load more"), and per-row edit / duplicate / delete.
- **Item editor** — a structured **tree editor** with per-attribute DynamoDB types
  (S, N, BOOL, NULL, M, L, SS, NS, BS, B) and a **Raw JSON** editor (Monaco) that
  toggles between *document* form and *DynamoDB JSON* (wire) form. Conversions are
  lossless — Sets, Binary, and high-precision Numbers survive a full round-trip.
- **Query / Scan** — a guided builder (PK/SK conditions + filters) that generates the
  `KeyConditionExpression` / `FilterExpression` and shows them read-only, plus a
  **PartiQL** editor with a full-scan warning.
- **Tables & indexes** — create tables (PK/SK, billing mode, GSIs/LSIs), add/remove
  GSIs and toggle billing on existing tables, and drop tables.
- **Safety** — read-only connections disable all writes; every workspace shows an
  environment banner; deletes and table drops require confirmation.

## Develop

```bash
npm install
npm run dev          # electron-vite with HMR
```

## Quality gates

```bash
npm run typecheck    # tsc for main/preload + renderer
npm test             # vitest unit tests (marshalling round-trips, expression builder)
```

### Integration test (real DynamoDB)

```bash
docker run -d -p 8000:8000 amazon/dynamodb-local
DDB_ENDPOINT=http://localhost:8000 npx vitest run integration
```

The integration suite is skipped automatically when `DDB_ENDPOINT` is unset.

## Package

```bash
npm run pack:win     # NSIS installer
npm run pack:mac     # dmg
```

> Packaging needs an app icon under `build/` and downloads the platform Electron
> binaries on first run. Code-signing / notarization are not configured.

## Architecture

```
src/
├─ shared/            # types, IPC contract, lossless marshal util (env-agnostic)
├─ main/              # Electron main: connection store, DynamoDB service, IPC handlers
├─ preload/           # contextBridge — exposes window.api (no credentials in renderer)
└─ renderer/          # React UI (Mantine, TanStack Query/Table, Zustand, Monaco)
```

The AWS SDK runs only in the main process; the renderer calls it over typed IPC, so
AWS credentials never enter the browser context.
