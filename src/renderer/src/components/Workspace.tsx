import { Box, Center, Group, Stack, Tabs, Text, ActionIcon } from '@mantine/core'
import { IconBolt, IconX } from '@tabler/icons-react'
import { useUiStore } from '../store'
import { TableWorkspace } from './TableWorkspace'

export function Workspace(): JSX.Element {
  const openTables = useUiStore((s) => s.openTables)
  const activeTableKey = useUiStore((s) => s.activeTableKey)
  const setActiveTable = useUiStore((s) => s.setActiveTable)
  const closeTable = useUiStore((s) => s.closeTable)

  if (openTables.length === 0) {
    return (
      <Center h="100%">
        <Stack align="center" gap="xs">
          <IconBolt size={48} color="var(--mantine-color-dark-3)" />
          <Text c="dimmed">
            Select a table from a connection on the left to start browsing.
          </Text>
        </Stack>
      </Center>
    )
  }

  return (
    <Tabs
      value={activeTableKey}
      onChange={(v) => v && setActiveTable(v)}
      keepMounted={false}
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <Tabs.List style={{ flexShrink: 0 }}>
        {openTables.map((t) => (
          <Tabs.Tab key={t.key} value={t.key}>
            <Group gap={6} wrap="nowrap">
              <Text size="sm">{t.tableName}</Text>
              <ActionIcon
                component="div"
                size="xs"
                variant="subtle"
                color="gray"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTable(t.key)
                }}
              >
                <IconX size={12} />
              </ActionIcon>
            </Group>
          </Tabs.Tab>
        ))}
      </Tabs.List>

      {openTables.map((t) => (
        <Tabs.Panel
          key={t.key}
          value={t.key}
          style={{ flex: 1, overflow: 'hidden' }}
        >
          <Box style={{ height: '100%' }}>
            <TableWorkspace connectionId={t.connectionId} tableName={t.tableName} />
          </Box>
        </Tabs.Panel>
      ))}
    </Tabs>
  )
}
