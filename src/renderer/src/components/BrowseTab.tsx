import { useCallback, useEffect } from 'react'
import { Box, Button, Group, NumberInput, Stack, Text } from '@mantine/core'
import { modals } from '@mantine/modals'
import { IconPlus, IconRefresh, IconDownload } from '@tabler/icons-react'
import { useState } from 'react'
import type { DocItem } from '@shared/marshal'
import type { ConnectionConfig, TableDescription } from '@shared/types'
import { useDataPager } from '../hooks/useDataPager'
import { DataGrid } from './DataGrid'
import { extractKey, describeKey } from '../lib/keys'
import { notifyError, notifySuccess } from '../lib/notify'
import type { ItemEditorRequest } from './TableWorkspace'

export function BrowseTab({
  connection,
  table,
  onEditItem
}: {
  connection: ConnectionConfig
  table: TableDescription
  onEditItem: (req: ItemEditorRequest) => void
}): JSX.Element {
  const [pageSize, setPageSize] = useState(50)

  const fetcher = useCallback(
    (exclusiveStartKey?: Record<string, unknown>) =>
      window.api.scan({
        connectionId: connection.id,
        tableName: table.tableName,
        limit: pageSize,
        exclusiveStartKey
      }),
    [connection.id, table.tableName, pageSize]
  )

  const pager = useDataPager(fetcher)
  const { run } = pager

  useEffect(() => {
    run()
  }, [run])

  const handleDelete = (item: DocItem): void => {
    modals.openConfirmModal({
      title: 'Delete item',
      children: (
        <Text size="sm">
          Delete this item from <b>{table.tableName}</b>?
          <br />
          <Text span c="dimmed" size="xs" className="mono">
            {describeKey(item, table.keySchema)}
          </Text>
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await window.api.deleteItem({
            connectionId: connection.id,
            tableName: table.tableName,
            key: extractKey(item, table.keySchema)
          })
          notifySuccess('Item deleted')
          run()
        } catch (e) {
          notifyError('Delete failed', e)
        }
      }
    })
  }

  return (
    <Stack gap={0} h="100%">
      <Group justify="space-between" px="sm" py={6} style={{ flexShrink: 0 }}>
        <Group gap="xs">
          {!connection.readOnly && (
            <Button
              size="compact-sm"
              leftSection={<IconPlus size={14} />}
              onClick={() => onEditItem({ mode: 'new' })}
            >
              New item
            </Button>
          )}
          <Button
            size="compact-sm"
            variant="light"
            leftSection={<IconRefresh size={14} />}
            onClick={run}
            loading={pager.loading}
          >
            Refresh
          </Button>
          <NumberInput
            size="xs"
            w={110}
            min={1}
            max={1000}
            value={pageSize}
            onChange={(v) => setPageSize(Number(v) || 50)}
            label={undefined}
            prefix="Limit "
          />
        </Group>
        <Text size="xs" c="dimmed">
          {pager.items.length} loaded · {pager.scannedCount} scanned
        </Text>
      </Group>

      <Box style={{ flex: 1, minHeight: 0 }}>
        <DataGrid
          items={pager.items}
          keySchema={table.keySchema}
          readOnly={connection.readOnly}
          onEditItem={(item) => onEditItem({ mode: 'edit', item })}
          onDuplicateItem={(item) => onEditItem({ mode: 'new', item })}
          onDeleteItem={handleDelete}
        />
      </Box>

      {pager.hasMore && (
        <Group justify="center" py={6} style={{ flexShrink: 0 }}>
          <Button
            size="compact-sm"
            variant="subtle"
            leftSection={<IconDownload size={14} />}
            onClick={pager.loadMore}
            loading={pager.loading}
          >
            Load more
          </Button>
        </Group>
      )}
    </Stack>
  )
}
