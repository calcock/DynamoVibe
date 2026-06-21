import { useMemo, useRef } from 'react'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ActionIcon, Box, Code, Group, Menu, Text } from '@mantine/core'
import {
  IconCopy,
  IconDotsVertical,
  IconKey,
  IconPencil,
  IconTrash
} from '@tabler/icons-react'
import type { DocItem, DocValue } from '@shared/marshal'
import type { KeySchemaElement } from '@shared/types'
import { previewValue, ddbTypeOf } from '../lib/docValue'

interface DataGridProps {
  items: DocItem[]
  keySchema: KeySchemaElement[]
  readOnly: boolean
  onEditItem?: (item: DocItem) => void
  onDuplicateItem?: (item: DocItem) => void
  onDeleteItem?: (item: DocItem) => void
}

const ROW_HEIGHT = 34

export function DataGrid({
  items,
  keySchema,
  readOnly,
  onEditItem,
  onDuplicateItem,
  onDeleteItem
}: DataGridProps): JSX.Element {
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
      cell: (ctx) => <Cell value={ctx.getValue() as DocValue | undefined} />
    }))

    if (onEditItem || onDeleteItem || onDuplicateItem) {
      cols.push({
        id: '__actions',
        header: () => null,
        size: 44,
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
  }, [columnKeys, keyNames, onEditItem, onDeleteItem, onDuplicateItem, readOnly])

  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel()
  })

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
        <Box
          style={{
            display: 'flex',
            position: 'sticky',
            top: 0,
            zIndex: 2,
            background: 'var(--mantine-color-dark-7)'
          }}
        >
          {table.getHeaderGroups()[0]?.headers.map((header) => (
            <Box
              key={header.id}
              style={{
                ...cellBox(header.id),
                padding: '6px 8px',
                borderBottom: '1px solid var(--mantine-color-dark-4)'
              }}
            >
              {header.isPlaceholder
                ? null
                : flexRender(header.column.columnDef.header, header.getContext())}
            </Box>
          ))}
        </Box>

        <Box style={{ position: 'relative', height: virtualizer.getTotalSize() }}>
          {virtualRows.map((vr) => {
            const row = rows[vr.index]
            return (
              <Box
                key={row.id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  transform: `translateY(${vr.start}px)`,
                  display: 'flex',
                  height: ROW_HEIGHT
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
                      borderBottom: '1px solid var(--mantine-color-dark-6)'
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

const colWidth = (id: string): number => (id === '__actions' ? 44 : 220)

/** Shared per-column box sizing used by both header and body cells. */
function cellBox(id: string): React.CSSProperties {
  return {
    width: colWidth(id),
    flex: `0 0 ${colWidth(id)}px`,
    boxSizing: 'border-box',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    borderRight: '1px solid var(--mantine-color-dark-6)'
  }
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
