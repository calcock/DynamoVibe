# Re-orderable, persisted data-grid columns

## Goal
Let users drag data-grid column headers to reorder them, persist the order per
connection+table combination (surviving reloads), and provide a reset control
to restore the default order.

## Decisions (from clarifying questions)
- **Reorder UX:** drag column headers using the `@dnd-kit` library (smoother
  visuals than native HTML5 drag).
- **Reset control:** a column-options menu (⋮) in the pinned top-right corner of
  the grid itself — self-contained in `DataGrid`, no parent-toolbar changes.
- **Persistence:** reuse the existing zustand + localStorage UI store
  (`dynamovibe-ui`), the same mechanism already used for editor prefs. Order is
  scoped by the existing `connectionId::tableName` composite key.

## Codebase context
- Electron + React (TypeScript), Mantine UI, TanStack React Table v8 +
  React Virtual. DynamoDB GUI client.
- `DataGrid.tsx` built columns dynamically (PK/SK first, then discovery order)
  with no `columnOrder` state and no persistence.
- Used in `BrowseTab.tsx` (1 grid) and `QueryTab.tsx` (2 grids); all had
  `connection.id` / `table.tableName` available to pass down.

## Changes made

### `package.json`
Added `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.

### `src/renderer/src/store.ts`
- Exported the existing `tableKey(connectionId, tableName)` helper.
- Added persisted state `columnOrder: Record<string, string[]>` (data-attribute
  ids only — never the actions column).
- Added actions `setColumnOrder(key, order)` and `resetColumnOrder(key)`.
- Added `columnOrder` to the `partialize` whitelist.

### `src/renderer/src/components/DataGrid.tsx`
- New props `connectionId` / `tableName`; reads saved order + actions from store.
- `orderedKeys` memo reconciles saved order against the live attribute set
  (keeps still-present saved ids in order, appends newly-seen attributes) so the
  grid stays correct when a table's attributes change.
- Feeds TanStack a controlled `columnOrder` state = reconciled data ids followed
  by the pinned `__actions` id.
- Header row wrapped in dnd-kit `DndContext` + `SortableContext` (horizontal).
  Data headers are draggable via `useSortable` (`SortableHeader`); the actions
  column is excluded (`ActionsHeader`). A 5px `PointerSensor` activation
  distance preserves click-to-sort while enabling drag-to-reorder. `onDragEnd`
  computes the new order with `arrayMove` and saves it.
- The previously-empty actions header now hosts `ColumnOptionsMenu` (⋮) with
  "Reset column order", disabled when no custom order exists.
- Introduced an `ACTIONS_ID` constant replacing scattered `'__actions'` literals.

### `BrowseTab.tsx` / `QueryTab.tsx`
All three `<DataGrid>` call sites now pass `connectionId` / `tableName`.

## Verification
- `npm run typecheck` — passes.
- `npm test` — 22 passed, 2 integration tests skipped (as usual).
- Manual: `npm run dev`, drag headers to reorder, reload to confirm
  persistence, switch tables to confirm per-table scoping, use the ⋮ menu to
  reset.
