import { useState } from 'react'
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Collapse,
  Group,
  Loader,
  Menu,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton
} from '@mantine/core'
import {
  IconChevronDown,
  IconChevronRight,
  IconDatabase,
  IconDotsVertical,
  IconLock,
  IconPlus,
  IconRefresh,
  IconTable,
  IconTrash,
  IconPencil,
  IconSearch,
  IconTablePlus
} from '@tabler/icons-react'
import { modals } from '@mantine/modals'
import type { ConnectionConfig } from '@shared/types'
import { useConnections, useDeleteConnection, useTables } from '../hooks/queries'
import { useUiStore } from '../store'
import { ENV_COLORS } from '../lib/docValue'
import { notifyError, notifySuccess } from '../lib/notify'
import { ConnectionModal } from './ConnectionModal'
import { CreateTableModal } from './CreateTableModal'

export function ConnectionsSidebar(): JSX.Element {
  const { data: connections, isLoading } = useConnections()
  const [editing, setEditing] = useState<ConnectionConfig | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const openNew = (): void => {
    setEditing(null)
    setModalOpen(true)
  }
  const openEdit = (c: ConnectionConfig): void => {
    setEditing(c)
    setModalOpen(true)
  }

  return (
    <Stack gap={0} h="100%">
      <Group justify="space-between" px="sm" py="xs">
        <Text fw={600} size="sm">
          Connections
        </Text>
        <Button
          size="compact-xs"
          leftSection={<IconPlus size={14} />}
          onClick={openNew}
          variant="light"
        >
          New
        </Button>
      </Group>

      <ScrollArea style={{ flex: 1 }}>
        <Stack gap={2} px={6} pb="md">
          {isLoading && <Loader size="sm" m="md" />}
          {connections?.length === 0 && (
            <Text size="xs" c="dimmed" p="sm">
              No connections yet. Click “New” to add a local or AWS connection.
            </Text>
          )}
          {connections?.map((c) => (
            <ConnectionRow key={c.id} connection={c} onEdit={() => openEdit(c)} />
          ))}
        </Stack>
      </ScrollArea>

      <ConnectionModal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
      />
    </Stack>
  )
}

function ConnectionRow({
  connection,
  onEdit
}: {
  connection: ConnectionConfig
  onEdit: () => void
}): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const activeConnectionId = useUiStore((s) => s.activeConnectionId)
  const setActiveConnection = useUiStore((s) => s.setActiveConnection)
  const closeConnectionTables = useUiStore((s) => s.closeConnectionTables)
  const deleteConn = useDeleteConnection()

  const isActive = activeConnectionId === connection.id

  const toggle = (): void => {
    const next = !expanded
    setExpanded(next)
    setActiveConnection(connection.id)
  }

  const confirmDelete = (): void => {
    modals.openConfirmModal({
      title: 'Delete connection',
      children: (
        <Text size="sm">
          Remove connection <b>{connection.name}</b> and any stored credentials? This
          does not touch any DynamoDB data.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => {
        closeConnectionTables(connection.id)
        deleteConn.mutate(connection.id, {
          onSuccess: () => notifySuccess('Connection deleted'),
          onError: (e) => notifyError('Delete failed', e)
        })
      }
    })
  }

  return (
    <Box>
      <Group gap={4} wrap="nowrap">
        <UnstyledButton
          onClick={toggle}
          style={{ flex: 1, borderRadius: 6, padding: '6px 8px' }}
          bg={isActive ? 'var(--mantine-color-dark-5)' : undefined}
        >
          <Group gap={6} wrap="nowrap">
            {expanded ? (
              <IconChevronDown size={14} />
            ) : (
              <IconChevronRight size={14} />
            )}
            <IconDatabase size={15} color={`var(--mantine-color-${ENV_COLORS[connection.env]}-5)`} />
            <Text size="sm" truncate style={{ flex: 1 }}>
              {connection.name}
            </Text>
            {connection.readOnly && (
              <Tooltip label="Read-only">
                <IconLock size={13} color="var(--mantine-color-orange-5)" />
              </Tooltip>
            )}
            <Badge size="xs" variant="light" color={ENV_COLORS[connection.env]}>
              {connection.env}
            </Badge>
          </Group>
        </UnstyledButton>
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon variant="subtle" color="gray" size="sm">
              <IconDotsVertical size={14} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconPencil size={14} />} onClick={onEdit}>
              Edit
            </Menu.Item>
            <Menu.Item
              color="red"
              leftSection={<IconTrash size={14} />}
              onClick={confirmDelete}
            >
              Delete
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>

      <Collapse in={expanded}>
        <Box pl={20}>{expanded && <TableList connection={connection} />}</Box>
      </Collapse>
    </Box>
  )
}

function TableList({ connection }: { connection: ConnectionConfig }): JSX.Element {
  const connectionId = connection.id
  const { data: tables, isLoading, isError, error, refetch, isFetching } =
    useTables(connectionId)
  const openTable = useUiStore((s) => s.openTable)
  const [filter, setFilter] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  if (isLoading) return <Loader size="xs" m="xs" />
  if (isError)
    return (
      <Stack gap={4} p="xs">
        <Text size="xs" c="red">
          {(error as Error).message}
        </Text>
        <Button size="compact-xs" variant="light" onClick={() => refetch()}>
          Retry
        </Button>
      </Stack>
    )

  const filtered = (tables ?? []).filter((t) =>
    t.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <Stack gap={2} pb="xs">
      <Group gap={4} wrap="nowrap" pr={6}>
        <TextInput
          size="xs"
          placeholder="Filter tables"
          value={filter}
          onChange={(e) => setFilter(e.currentTarget.value)}
          leftSection={<IconSearch size={12} />}
          style={{ flex: 1 }}
        />
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          loading={isFetching}
          onClick={() => refetch()}
        >
          <IconRefresh size={13} />
        </ActionIcon>
        {!connection.readOnly && (
          <Tooltip label="Create table">
            <ActionIcon
              variant="subtle"
              color="blue"
              size="sm"
              onClick={() => setCreateOpen(true)}
            >
              <IconTablePlus size={14} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
      {filtered.length === 0 && (
        <Text size="xs" c="dimmed" px={6}>
          No tables
        </Text>
      )}
      {filtered.map((t) => (
        <UnstyledButton
          key={t}
          onClick={() => openTable(connectionId, t)}
          style={{ borderRadius: 6, padding: '4px 8px' }}
        >
          <Group gap={6} wrap="nowrap">
            <IconTable size={13} color="var(--mantine-color-blue-4)" />
            <Text size="xs" truncate>
              {t}
            </Text>
          </Group>
        </UnstyledButton>
      ))}
      <CreateTableModal
        connectionId={connectionId}
        opened={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </Stack>
  )
}
