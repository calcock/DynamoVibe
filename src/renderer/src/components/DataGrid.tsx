import { useMemo, useRef, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Header,
  type Row,
  type SortingState
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ActionIcon, Box, Code, Group, Menu, Text } from '@mantine/core'
import {
  IconArrowDown,
  IconArrowsSort,
  IconArrowUp,
  IconColumns,
  IconCopy,
  IconDotsVertical,
  IconKey,
  IconPencil,
  IconRestore,
  IconTrash
} from '@tabler/icons-react'
import type { DocItem, DocValue } from '@shared/marshal'
import type { KeySchemaElement } from '@shared/types'
import { previewValue, ddbTypeOf, isTagged } from '../lib/docValue'
import { tableKey as makeTableKey, useUiStore } from '../store'

const ACTIONS_ID = '__actions'

interface DataGridProps {
  connectionId: string
  tableName: string
  items: DocItem[]
  keySchema: KeySchemaElement[]
  readOnly: boolean
  onEditItem?: (item: DocItem) => void
  onDuplicateItem?: (item: DocItem) => void
  onDeleteItem?: (item: DocItem) => void
}

const ROW_HEIGHT = 34

export function DataGrid({
  connectionId,
  tableName,
  items,
  keySchema,
  readOnly,
  onEditItem,
  onDuplicateItem,
  onDeleteItem
}: DataGridProps): JSX.Element {
  const gridKey = makeTableKey(connectionId, tableName)
  const savedOrder = useUiStore((s) => s.columnOrder[gridKey])
  const setColumnOrder = useUiStore((s) => s.setColumnOrder)
  const resetColumnOrder = useUiStore((s) => s.resetColumnOrder)

  const keyNames = useMemo(() => keySchema.map((k) => k.attributeName), [keySchema])

  const columnKeys = useMemo(() => {
    const seen = new Set<string>()
    const order: string[] = []
    // Pinned key attributes first.
    for (const k of keyNames) {
      if (!seen.has(k)) {
        seen.add(k)
        order.push(k)
      }
    }
    for (const item of items) {
      for (const k of Object.keys(item)) {
        if (!seen.has(k)) {
          seen.add(k)
          order.push(k)
        }
      }
    }
    return order
  }, [items, keyNames])

  // Effective data-column order: saved order reconciled against the live
  // attribute set — keep saved ids that still exist, append newly-seen ones.
  const orderedKeys = useMemo(() => {
    if (!savedOrder || savedOrder.length === 0) return columnKeys
    const live = new Set(columnKeys)
    const result = savedOrder.filter((id) => live.has(id))
    const placed = new Set(result)
    for (const id of columnKeys) {
      if (!placed.has(id)) result.push(id)
    }
    return result
  }, [savedOrder, columnKeys])

  const hasActions = Boolean(onEditItem || onDeleteItem || onDuplicateItem)
  const isCustomized = Boolean(savedOrder && savedOrder.length > 0)

  const columns = useMemo<ColumnDef<DocItem>[]>(() => {
    const cols: ColumnDef<DocItem>[] = columnKeys.map((key) => ({
      id: key,
      accessorFn: (row) => row[key],
      header: () => (
        <Group gap={4} wrap="nowrap">
          {keyNames.includes(key) && (
            <IconKey size={12} color="var(--mantine-color-yellow-5)" />
          )}
          <Text size="xs" fw={600} truncate>
            {key}
          </Text>
        </Group>
      ),
      cell: (ctx) => <Cell value={ctx.getValue() as DocValue | undefined} />,
      sortingFn: docSortingFn,
      sortUndefined: 'last'
    }))

    if (onEditItem || onDeleteItem || onDuplicateItem) {
      cols.push({
        id: ACTIONS_ID,
        header: () => (
          <ColumnOptionsMenu
            isCustomized={isCustomized}
            onReset={() => resetColumnOrder(gridKey)}
          />
        ),
        size: 44,
        enableSorting: false,
        cell: (ctx) => (
          <RowActions
            item={ctx.row.original}
            readOnly={readOnly}
            onEditItem={onEditItem}
            onDuplicateItem={onDuplicateItem}
            onDeleteItem={onDeleteItem}
          />
        )
      })
    }
    return cols
  }, [
    columnKeys,
    keyNames,
    onEditItem,
    onDeleteItem,
    onDuplicateItem,
    readOnly,
    isCustomized,
    resetColumnOrder,
    gridKey
  ])

  const [sorting, setSorting] = useState<SortingState>([])

  // Controlled column order: data columns follow the reconciled order; the
  // actions column (if any) is always pinned last.
  const columnOrder = useMemo(
    () => (hasActions ? [...orderedKeys, ACTIONS_ID] : orderedKeys),
    [orderedKeys, hasActions]
  )

  const table = useReactTable({
    data: items,
    columns,
    state: { sorting, columnOrder },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  })

  const sensors = useSensors(
    // A small drag threshold so a plain click still toggles sorting.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = orderedKeys.indexOf(String(active.id))
    const to = orderedKeys.indexOf(String(over.id))
    if (from === -1 || to === -1) return
    setColumnOrder(gridKey, arrayMove(orderedKeys, from, to))
  }

  const parentRef = useRef<HTMLDivElement>(null)
  const rows = table.getRowModel().rows
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12
  })

  if (items.length === 0) {
    return (
      <Center>
        <Text c="dimmed" size="sm" p="xl">
          No items.
        </Text>
      </Center>
    )
  }

  const virtualRows = virtualizer.getVirtualItems()
  const leafColumns = table.getVisibleLeafColumns()
  const totalWidth = leafColumns.reduce((sum, c) => sum + colWidth(c.id), 0)

  return (
    <Box
      ref={parentRef}
      style={{ height: '100%', overflow: 'auto', position: 'relative' }}
      className="mono"
    >
      {/* Both header and body rows are flex with the same per-column widths so
          columns stay aligned (a virtualized body can't share a <table> layout
          with the header). */}
      <Box style={{ width: Math.max(totalWidth, 0), minWidth: '100%' }}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <Box
            style={{
              display: 'flex',
              position: 'sticky',
              top: 0,
              zIndex: 2,
              background: 'var(--mantine-color-dark-7)'
            }}
          >
            <SortableContext items={orderedKeys} strategy={horizontalListSortingStrategy}>
              {table.getHeaderGroups()[0]?.headers.map((header) =>
                header.column.id === ACTIONS_ID ? (
                  <ActionsHeader key={header.id} header={header} />
                ) : (
                  <SortableHeader key={header.id} header={header} />
                )
              )}
            </SortableContext>
          </Box>
        </DndContext>

        <Box style={{ position: 'relative', height: virtualizer.getTotalSize() }}>
          {virtualRows.map((vr) => {
            const row = rows[vr.index]
            return (
              <Box
                key={row.id}
                onDoubleClick={onEditItem ? () => onEditItem(row.original) : undefined}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  transform: `translateY(${vr.start}px)`,
                  display: 'flex',
                  height: ROW_HEIGHT,
                  cursor: onEditItem ? 'pointer' : undefined
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <Box
                    key={cell.id}
                    style={{
                      ...cellBox(cell.column.id),
                      padding: '4px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      borderBottom: '1px solid var(--mantine-color-dark-6)',
                      zIndex: cell.column.id === ACTIONS_ID ? 1 : undefined
                    }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </Box>
                ))}
              </Box>
            )
          })}
        </Box>
      </Box>
    </Box>
  )
}

/** Draggable, sortable header cell for a data column. */
function SortableHeader({ header }: { header: Header<DocItem, unknown> }): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: header.column.id })
  const canSort = header.column.getCanSort()
  const sorted = header.column.getIsSorted()
  return (
    <Box
      ref={setNodeRef}
      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
      {...attributes}
      {...listeners}
      style={{
        ...cellBox(header.id),
        padding: '6px 8px',
        borderBottom: '1px solid var(--mantine-color-dark-4)',
        cursor: 'grab',
        userSelect: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 4,
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : undefined,
        zIndex: isDragging ? 4 : undefined,
        background: isDragging ? 'var(--mantine-color-dark-5)' : undefined
      }}
    >
      {header.isPlaceholder
        ? null
        : flexRender(header.column.columnDef.header, header.getContext())}
      {canSort && <SortIndicator state={sorted} />}
    </Box>
  )
}

/** The pinned actions/options header cell (not draggable). */
function ActionsHeader({ header }: { header: Header<DocItem, unknown> }): JSX.Element {
  return (
    <Box
      style={{
        ...cellBox(header.id),
        padding: '6px 8px',
        borderBottom: '1px solid var(--mantine-color-dark-4)',
        zIndex: 3,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {header.isPlaceholder
        ? null
        : flexRender(header.column.columnDef.header, header.getContext())}
    </Box>
  )
}

/** Grid options menu (top-right corner): reset column order to default. */
function ColumnOptionsMenu({
  isCustomized,
  onReset
}: {
  isCustomized: boolean
  onReset: () => void
}): JSX.Element {
  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <ActionIcon variant="subtle" color="gray" size="sm" title="Column options">
          <IconColumns size={14} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<IconRestore size={14} />}
          disabled={!isCustomized}
          onClick={onReset}
        >
          Reset column order
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}

const colWidth = (id: string): number => (id === ACTIONS_ID ? 44 : 220)

/** Shared per-column box sizing used by both header and body cells. */
function cellBox(id: string): React.CSSProperties {
  const isActions = id === ACTIONS_ID
  return {
    width: colWidth(id),
    flex: `0 0 ${colWidth(id)}px`,
    boxSizing: 'border-box',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    borderRight: isActions ? undefined : '1px solid var(--mantine-color-dark-6)',
    // Pin the actions column to the right edge so it stays visible while the
    // rest of the columns scroll horizontally underneath it.
    ...(isActions
      ? {
          position: 'sticky',
          right: 0,
          background: 'var(--mantine-color-dark-7)',
          borderLeft: '1px solid var(--mantine-color-dark-4)'
        }
      : {})
  }
}

/** Maps a document value to a comparable primitive so columns with mixed/typed
 *  DynamoDB values sort sensibly (numbers numerically, complex types by preview). */
function sortKey(v: DocValue | undefined): string | number | boolean {
  if (v === undefined || v === null) return ''
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v
  if (isTagged(v) && v.__ddb === 'N') return Number(v.value)
  return previewValue(v)
}

/** Sorting comparator for data columns covering DynamoDB document values. */
function docSortingFn(a: Row<DocItem>, b: Row<DocItem>, columnId: string): number {
  const av = sortKey(a.getValue(columnId) as DocValue | undefined)
  const bv = sortKey(b.getValue(columnId) as DocValue | undefined)
  if (typeof av === 'number' && typeof bv === 'number') return av - bv
  const as = String(av)
  const bs = String(bv)
  return as < bs ? -1 : as > bs ? 1 : 0
}

function SortIndicator({ state }: { state: false | 'asc' | 'desc' }): JSX.Element {
  if (state === 'asc') return <IconArrowUp size={12} style={{ flexShrink: 0 }} />
  if (state === 'desc') return <IconArrowDown size={12} style={{ flexShrink: 0 }} />
  return (
    <IconArrowsSort
      size={12}
      style={{ flexShrink: 0, opacity: 0.35 }}
      color="var(--mantine-color-dimmed)"
    />
  )
}

function Center({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <Box style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
      {children}
    </Box>
  )
}

function Cell({ value }: { value: DocValue | undefined }): JSX.Element {
  if (value === undefined) {
    return (
      <Text size="xs" c="dimmed" fs="italic">
        —
      </Text>
    )
  }
  const type = ddbTypeOf(value)
  const isComplex = type === 'M' || type === 'L'
  return (
    <Group gap={6} wrap="nowrap">
      <Code
        fz={9}
        c="dimmed"
        style={{ flexShrink: 0, padding: '0 3px', background: 'var(--mantine-color-dark-6)' }}
      >
        {type}
      </Code>
      <Text
        size="xs"
        truncate
        c={value === null ? 'dimmed' : isComplex ? 'blue.3' : undefined}
        title={isComplex ? JSON.stringify(value) : previewValue(value)}
      >
        {previewValue(value)}
      </Text>
    </Group>
  )
}

function RowActions({
  item,
  readOnly,
  onEditItem,
  onDuplicateItem,
  onDeleteItem
}: {
  item: DocItem
  readOnly: boolean
  onEditItem?: (item: DocItem) => void
  onDuplicateItem?: (item: DocItem) => void
  onDeleteItem?: (item: DocItem) => void
}): JSX.Element {
  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <ActionIcon variant="subtle" color="gray" size="sm">
          <IconDotsVertical size={14} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<IconPencil size={14} />}
          onClick={() => onEditItem?.(item)}
        >
          {readOnly ? 'View' : 'Edit'}
        </Menu.Item>
        {!readOnly && (
          <Menu.Item
            leftSection={<IconCopy size={14} />}
            onClick={() => onDuplicateItem?.(item)}
          >
            Duplicate
          </Menu.Item>
        )}
        {!readOnly && (
          <Menu.Item
            color="red"
            leftSection={<IconTrash size={14} />}
            onClick={() => onDeleteItem?.(item)}
          >
            Delete
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  )
}
