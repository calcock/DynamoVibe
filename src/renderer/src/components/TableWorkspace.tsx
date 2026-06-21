import { useState } from 'react'
import { Loader, Stack, Tabs, Text } from '@mantine/core'
import {
  IconList,
  IconSearch,
  IconSettings
} from '@tabler/icons-react'
import type { DocItem } from '@shared/marshal'
import { useConnection, useTableDescription } from '../hooks/queries'
import { EnvBanner } from './EnvBanner'
import { BrowseTab } from './BrowseTab'
import { QueryTab } from './QueryTab'
import { IndexesTab } from './IndexesTab'
import { ItemEditor } from './ItemEditor'

export interface ItemEditorRequest {
  mode: 'new' | 'edit'
  item?: DocItem
}

export function TableWorkspace({
  connectionId,
  tableName
}: {
  connectionId: string
  tableName: string
}): JSX.Element {
  const connection = useConnection(connectionId)
  const { data: table, isLoading, isError, error } = useTableDescription(
    connectionId,
    tableName
  )
  const [editorReq, setEditorReq] = useState<ItemEditorRequest | null>(null)

  const openEditor = (req: ItemEditorRequest): void => setEditorReq(req)

  if (!connection) return <Loader m="md" size="sm" />

  return (
    <Stack gap={0} h="100%">
      <EnvBanner connection={connection} />

      {isLoading && <Loader m="md" size="sm" />}
      {isError && (
        <Text c="red" p="md" size="sm">
          {(error as Error).message}
        </Text>
      )}

      {table && (
        <Tabs
          defaultValue="browse"
          keepMounted={false}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
        >
          <Tabs.List style={{ flexShrink: 0 }}>
            <Tabs.Tab value="browse" leftSection={<IconList size={14} />}>
              Browse
            </Tabs.Tab>
            <Tabs.Tab value="query" leftSection={<IconSearch size={14} />}>
              Query
            </Tabs.Tab>
            <Tabs.Tab value="indexes" leftSection={<IconSettings size={14} />}>
              Indexes &amp; Settings
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="browse" style={{ flex: 1, minHeight: 0 }}>
            <BrowseTab
              connection={connection}
              table={table}
              onEditItem={openEditor}
            />
          </Tabs.Panel>
          <Tabs.Panel value="query" style={{ flex: 1, minHeight: 0 }}>
            <QueryTab connection={connection} table={table} onEditItem={openEditor} />
          </Tabs.Panel>
          <Tabs.Panel value="indexes" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            <IndexesTab connection={connection} table={table} />
          </Tabs.Panel>
        </Tabs>
      )}

      {table && editorReq && (
        <ItemEditor
          connection={connection}
          table={table}
          request={editorReq}
          onClose={() => setEditorReq(null)}
        />
      )}
    </Stack>
  )
}
