import { useState } from 'react'
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Group,
  Select,
  Stack,
  Table,
  Text,
  TextInput
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import type {
  ConnectionConfig,
  ProjectionType,
  TableDescription
} from '@shared/types'
import { useDeleteTable, useUpdateTableIndexes } from '../hooks/queries'
import { useUiStore } from '../store'
import { notifyError, notifySuccess } from '../lib/notify'

export function IndexesTab({
  connection,
  table
}: {
  connection: ConnectionConfig
  table: TableDescription
}): JSX.Element {
  const readOnly = connection.readOnly
  const update = useUpdateTableIndexes()
  const deleteTable = useDeleteTable()
  const closeConnectionTables = useUiStore((s) => s.closeTable)
  const [adding, setAdding] = useState(false)

  const onDeleteGsi = (indexName: string): void => {
    modals.openConfirmModal({
      title: 'Delete index',
      children: (
        <Text size="sm">
          Delete GSI <b>{indexName}</b> from <b>{table.tableName}</b>?
        </Text>
      ),
      labels: { confirm: 'Delete index', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        update.mutate(
          {
            connectionId: connection.id,
            tableName: table.tableName,
            payload: { deleteGlobalSecondaryIndexNames: [indexName] }
          },
          {
            onSuccess: () => notifySuccess('Index deletion started'),
            onError: (e) => notifyError('Failed', e)
          }
        )
    })
  }

  const onToggleBilling = (): void => {
    const next =
      table.billingMode === 'PAY_PER_REQUEST' ? 'PROVISIONED' : 'PAY_PER_REQUEST'
    update.mutate(
      {
        connectionId: connection.id,
        tableName: table.tableName,
        payload: { billingMode: next }
      },
      {
        onSuccess: () => notifySuccess(`Billing mode set to ${next}`),
        onError: (e) => notifyError('Failed', e)
      }
    )
  }

  const onDeleteTable = (): void => {
    modals.openConfirmModal({
      title: 'Drop table',
      children: (
        <Stack gap="xs">
          <Text size="sm">
            Permanently delete table <b>{table.tableName}</b> and all its items?
          </Text>
          <Text size="xs" c="red">
            This cannot be undone.
          </Text>
        </Stack>
      ),
      labels: { confirm: `Drop ${table.tableName}`, cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        deleteTable.mutate(
          { connectionId: connection.id, tableName: table.tableName },
          {
            onSuccess: () => {
              notifySuccess('Table dropped')
              closeConnectionTables(`${connection.id}::${table.tableName}`)
            },
            onError: (e) => notifyError('Drop failed', e)
          }
        )
    })
  }

  return (
    <Box p="md">
      <Stack gap="lg" maw={840}>
        <Card withBorder padding="sm">
          <Group justify="space-between" mb="xs">
            <Text fw={600}>Table</Text>
            <Group gap="xs">
              <Badge variant="light">{table.status ?? 'UNKNOWN'}</Badge>
              <Badge variant="light" color="grape">
                {table.billingMode === 'PAY_PER_REQUEST' ? 'On-demand' : 'Provisioned'}
              </Badge>
            </Group>
          </Group>
          <Table withRowBorders={false} verticalSpacing={2}>
            <Table.Tbody>
              <Table.Tr>
                <Table.Td c="dimmed" w={160}>
                  Key schema
                </Table.Td>
                <Table.Td className="mono">
                  {table.keySchema
                    .map((k) => `${k.attributeName} (${k.keyType === 'HASH' ? 'PK' : 'SK'})`)
                    .join(', ')}
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td c="dimmed">Attributes</Table.Td>
                <Table.Td className="mono">
                  {table.attributeDefinitions
                    .map((a) => `${a.attributeName}:${a.attributeType}`)
                    .join(', ')}
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td c="dimmed">Item count</Table.Td>
                <Table.Td>{table.itemCount ?? '—'}</Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
          {!readOnly && (
            <Button
              size="compact-xs"
              variant="light"
              mt="xs"
              loading={update.isPending}
              onClick={onToggleBilling}
            >
              Switch to {table.billingMode === 'PAY_PER_REQUEST' ? 'provisioned' : 'on-demand'}
            </Button>
          )}
        </Card>

        <Card withBorder padding="sm">
          <Group justify="space-between" mb="xs">
            <Text fw={600}>Global secondary indexes</Text>
            {!readOnly && (
              <Button
                size="compact-xs"
                variant="light"
                leftSection={<IconPlus size={12} />}
                onClick={() => setAdding((a) => !a)}
              >
                Add GSI
              </Button>
            )}
          </Group>

          {table.globalSecondaryIndexes.length === 0 && (
            <Text size="xs" c="dimmed">
              No global secondary indexes.
            </Text>
          )}
          <Stack gap={6}>
            {table.globalSecondaryIndexes.map((g) => (
              <Group key={g.indexName} justify="space-between">
                <Text size="sm" className="mono">
                  {g.indexName}{' '}
                  <Text span c="dimmed" size="xs">
                    [{g.keySchema.map((k) => k.attributeName).join(', ')}] ·{' '}
                    {g.projectionType}
                  </Text>
                </Text>
                {!readOnly && (
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    onClick={() => onDeleteGsi(g.indexName)}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                )}
              </Group>
            ))}
          </Stack>

          {adding && !readOnly && (
            <AddGsiForm
              connection={connection}
              table={table}
              onDone={() => setAdding(false)}
            />
          )}
        </Card>

        {table.localSecondaryIndexes.length > 0 && (
          <Card withBorder padding="sm">
            <Text fw={600} mb="xs">
              Local secondary indexes
            </Text>
            <Stack gap={6}>
              {table.localSecondaryIndexes.map((l) => (
                <Text key={l.indexName} size="sm" className="mono">
                  {l.indexName}{' '}
                  <Text span c="dimmed" size="xs">
                    [{l.keySchema.map((k) => k.attributeName).join(', ')}] ·{' '}
                    {l.projectionType}
                  </Text>
                </Text>
              ))}
            </Stack>
          </Card>
        )}

        {!readOnly && (
          <Card withBorder padding="sm" style={{ borderColor: 'var(--mantine-color-red-9)' }}>
            <Text fw={600} c="red" mb={4}>
              Danger zone
            </Text>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Drop this table and all its items.
              </Text>
              <Button
                color="red"
                variant="light"
                size="compact-sm"
                onClick={onDeleteTable}
              >
                Drop table
              </Button>
            </Group>
          </Card>
        )}
      </Stack>
    </Box>
  )
}

function AddGsiForm({
  connection,
  table,
  onDone
}: {
  connection: ConnectionConfig
  table: TableDescription
  onDone: () => void
}): JSX.Element {
  const update = useUpdateTableIndexes()
  const [indexName, setIndexName] = useState('')
  const [pk, setPk] = useState('')
  const [sk, setSk] = useState('')
  const [projection, setProjection] = useState<ProjectionType>('ALL')

  const submit = (): void => {
    if (!indexName || !pk) {
      notifyError('Missing fields', new Error('Index name and partition key required'))
      return
    }
    const keySchema = [
      { attributeName: pk, keyType: 'HASH' as const },
      ...(sk ? [{ attributeName: sk, keyType: 'RANGE' as const }] : [])
    ]
    update.mutate(
      {
        connectionId: connection.id,
        tableName: table.tableName,
        payload: {
          billingMode: table.billingMode,
          addGlobalSecondaryIndexes: [
            {
              indexName,
              keySchema,
              projectionType: projection,
              provisionedThroughput:
                table.billingMode === 'PROVISIONED'
                  ? { readCapacityUnits: 5, writeCapacityUnits: 5 }
                  : undefined
            }
          ]
        }
      },
      {
        onSuccess: () => {
          notifySuccess('Index creation started')
          onDone()
        },
        onError: (e) => notifyError('Failed', e)
      }
    )
  }

  return (
    <Box mt="sm">
      <Divider mb="sm" />
      <Group align="flex-end" gap="xs">
        <TextInput
          size="xs"
          label="Index name"
          value={indexName}
          onChange={(e) => setIndexName(e.currentTarget.value)}
        />
        <TextInput
          size="xs"
          label="Partition key"
          value={pk}
          onChange={(e) => setPk(e.currentTarget.value)}
        />
        <TextInput
          size="xs"
          label="Sort key (optional)"
          value={sk}
          onChange={(e) => setSk(e.currentTarget.value)}
        />
        <Select
          size="xs"
          label="Projection"
          w={130}
          data={['ALL', 'KEYS_ONLY']}
          value={projection}
          allowDeselect={false}
          onChange={(v) => setProjection((v as ProjectionType) ?? 'ALL')}
        />
        <Button size="compact-sm" onClick={submit} loading={update.isPending}>
          Create
        </Button>
      </Group>
      <Text size="xs" c="dimmed" mt={4}>
        New key attributes are registered as type S automatically.
      </Text>
    </Box>
  )
}
