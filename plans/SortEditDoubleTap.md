# Grid Sorting, Pinned Actions, Double-Tap Edit & Remembered Edit Mode

Summary of changes made to the DynamoVibe DynamoDB browser (React + Mantine + TanStack Table/Virtual + Zustand, Electron).

## Features implemented

1. **Sortable column headers** in the data grid.
2. **Always-visible row action menu** — the `⋮` button stays pinned while rows scroll horizontally.
3. **Double-click a row to open the edit view.**
4. **Editor remembers the last-used edit mode** (Structured/Raw + Document/DynamoDB JSON) across sessions.

## Files changed

### `src/renderer/src/components/DataGrid.tsx`

**Sorting**
- Imported `getSortedRowModel`, `SortingState`, `Row` from `@tanstack/react-table`; `useState` from React; `IconArrowUp/IconArrowDown/IconArrowsSort` from Tabler; `isTagged` from `../lib/docValue`.
- Added `sorting` state, wired `state`/`onSortingChange`/`getSortedRowModel` into `useReactTable`.
- Data columns get a custom `docSortingFn` + `sortUndefined: 'last'`. The comparator maps `DocValue` → comparable primitive via `sortKey()` (numbers/Tagged `N` numeric, strings/booleans as-is, complex types via `previewValue`).
- `__actions` column set to `enableSorting: false`.
- Headers are clickable for sortable columns (`getToggleSortingHandler`, `cursor: pointer`, `userSelect: none`) and render a `SortIndicator` (▲ asc / ▼ desc / dimmed bidirectional when unsorted).

**Pinned actions column**
- `cellBox()` makes `__actions` `position: sticky; right: 0` with a solid `dark-7` background, a left border, and no right border.
- Z-index layering: body actions cell `1`, header actions cell `3` (above the already-sticky header row at `2`) so content scrolls cleanly underneath.

**Double-click to edit**
- Added `onDoubleClick={() => onEditItem(row.original)}` to the row container with `cursor: pointer` when editing is available. Reuses the existing `onEditItem` callback (same path as the `⋮` menu Edit/View), so it works in read-only ("View") mode too.

### `src/renderer/src/store.ts`
- Wrapped `useUiStore` in Zustand `persist` middleware (key `dynamovibe-ui`).
- Added persisted prefs `editView: 'tree' | 'raw'` and `editRawFormat: 'document' | 'wire'` (exported types `EditViewMode`, `EditRawFormat`) plus setters `setEditView`, `setEditRawFormat`.
- `partialize` persists **only** the editor prefs — `openTables`/active selection remain session-only.

### `src/renderer/src/components/ItemEditor.tsx`
- View/raw-format types now imported from the store (`EditViewMode`/`EditRawFormat`).
- `view`/`rawFormat` now read/written via the store instead of local `useState`, so mode choices persist across opens and app restarts.
- The seed effect no longer forces `tree`/`document` on open; it seeds raw text in whichever format is currently persisted.

## Verification

- `npm run typecheck` passes (no `lint` script exists in this project).
- Runtime check: `npm run dev`, then
  - Click headers to sort (numbers sort numerically; null/undefined last); confirm key icon + text still render.
  - Scroll a wide table horizontally — `⋮` stays pinned and clickable; content passes under it cleanly.
  - Double-click a row to open the editor.
  - Switch to Raw JSON / DynamoDB JSON, close, reopen (or restart) — editor reopens in the last-used mode.
  - Repeat sorting/pinned-actions checks in the Query tab (Guided + PartiQL panels reuse `DataGrid`).
