import { useEffect, useState } from 'react'
import {
  ActionIcon,
  Button,
  Divider,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput
} from '@mantine/core'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import type {
  AttributeDefinition,
  BillingMode,
  CreateTableInput,
  ProjectionType
} from '@shared/types'
import { useCreateTable } from '../hooks/queries'
import { useUiStore } from '../store'
import { notifyError, notifySuccess } from '../lib/notify'

type ScalarType = 'S' | 'N' | 'B'

interface IndexDraft {
  indexName: string
  pk: string
  pkType: ScalarType
  sk: string
  skType: ScalarType
  projection: ProjectionType
  scope: 'GSI' | 'LSI'
}

export function CreateTableModal({
  connectionId,
  opened,
  onClose
}: {
  connectionId: string
  opened: boolean
  onClose: () => void
}): JSX.Element {
  const create = useCreateTable()
  const openTable = useUiStore((s) => s.openTable)

  const [name, setName] = useState('')
  const [pk, setPk] = useState('')
  const [pkType, setPkType] = useState<ScalarType>('S')
  const [sk, setSk] = useState('')
  const [skType, setSkType] = useState<ScalarType>('S')
  const [billing, setBilling] = useState<BillingMode>('PAY_PER_REQUEST')
  const [rcu, setRcu] = useState(5)
  const [wcu, setWcu] = useState(5)
  const [indexes, setIndexes] = useState<IndexDraft[]>([])

  useEffect(() => {
    if (opened) {
      setName('')
      setPk('')
      setPkType('S')
      setSk('')
      setSkType('S')
      setBilling('PAY_PER_REQUEST')
      setIndexes([])
    }
  }, [opened])

  const addIndex = (scope: 'GSI' | 'LSI'): void =>
    setIndexes((ix) => [
      ...ix,
      {
        indexName: '',
        pk: scope === 'LSI' ? pk : '',
        pkType: scope === 'LSI' ? pkType : 'S',
        sk: '',
        skType: 'S',
        projection: 'ALL',
        scope
      }
    ])

  const setIndex = (idx: number, patch: Partial<IndexDraft>): void =>
    setIndexes((ix) => ix.map((d, i) => (i === idx ? { ...d, ...patch } : d)))

  const buildInput = (): CreateTableInput | null => {
    if (!name.trim() || !pk.trim()) {
      notifyError('Missing fields', new Error('Table name and partition key required'))
      return null
    }
    const attrs = new Map<string, ScalarType>()
    attrs.set(pk, pkType)
    if (sk.trim()) attrs.set(sk, skType)

    const keySchema = [
      { attributeName: pk, keyType: 'HASH' as const },
      ...(sk.trim() ? [{ attributeName: sk, keyType: 'RANGE' as const }] : [])
    ]

    const gsis: NonNullable<CreateTableInput['globalSecondaryIndexes']> = []
    const lsis: NonNullable<CreateTableInput['localSecondaryIndexes']> = []
    for (const d of indexes) {
      if (!d.indexName.trim() || !d.pk.trim()) {
        notifyError('Missing fields', new Error('Each index needs a name and partition key'))
        return null
      }
      attrs.set(d.pk, d.pkType)
      const ks = [
        { attributeName: d.pk, keyType: 'HASH' as const },
        ...(d.sk.trim() ? [{ attributeName: d.sk, keyType: 'RANGE' as const }] : [])
      ]
      if (d.sk.trim()) attrs.set(d.sk, d.skType)
      if (d.scope === 'GSI') {
        gsis.push({
          indexName: d.indexName,
          keySchema: ks,
          projectionType: d.projection,
          provisionedThroughput:
            billing === 'PROVISIONED'
              ? { readCapacityUnits: rcu, writeCapacityUnits: wcu }
              : undefined
        })
      } else {
        lsis.push({ indexName: d.indexName, keySchema: ks, projectionType: d.projection })
      }
    }

    const attributeDefinitions: AttributeDefinition[] = [...attrs].map(
      ([attributeName, attributeType]) => ({ attributeName, attributeType })
    )

    return {
      tableName: name.trim(),
      attributeDefinitions,
      keySchema,
      billingMode: billing,
      provisionedThroughput:
        billing === 'PROVISIONED'
          ? { readCapacityUnits: rcu, writeCapacityUnits: wcu }
          : undefined,
      globalSecondaryIndexes: gsis.length ? gsis : undefined,
      localSecondaryIndexes: lsis.length ? lsis : undefined
    }
  }

  const submit = (): void => {
    const input = buildInput()
    if (!input) return
    create.mutate(
      { connectionId, input },
      {
        onSuccess: () => {
          notifySuccess('Table created', input.tableName)
          openTable(connectionId, input.tableName)
          onClose()
        },
        onError: (e) => notifyError('Create failed', e)
      }
    )
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Create table" size="xl">
      <Stack>
        <TextInput
          label="Table name"
          required
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
        />

        <Group grow align="flex-end">
          <TextInput
            label="Partition key"
            required
            value={pk}
            onChange={(e) => setPk(e.currentTarget.value)}
          />
          <ScalarSelect label="Type" value={pkType} onChange={setPkType} />
          <TextInput
            label="Sort key (optional)"
            value={sk}
            onChange={(e) => setSk(e.currentTarget.value)}
          />
          <ScalarSelect label="Type" value={skType} onChange={setSkType} />
        </Group>

        <div>
          <Text size="sm" fw={500} mb={4}>
            Billing mode
          </Text>
          <SegmentedControl
            value={billing}
            onChange={(v) => setBilling(v as BillingMode)}
            data={[
              { label: 'On-demand', value: 'PAY_PER_REQUEST' },
              { label: 'Provisioned', value: 'PROVISIONED' }
            ]}
          />
        </div>
        {billing === 'PROVISIONED' && (
          <Group>
            <NumberInput label="Read units" min={1} value={rcu} onChange={(v) => setRcu(Number(v) || 1)} w={130} />
            <NumberInput label="Write units" min={1} value={wcu} onChange={(v) => setWcu(Number(v) || 1)} w={130} />
          </Group>
        )}

        <Divider label="Secondary indexes" />
        <Group>
          <Button size="compact-xs" variant="light" leftSection={<IconPlus size={12} />} onClick={() => addIndex('GSI')}>
            Add GSI
          </Button>
          <Button
            size="compact-xs"
            variant="light"
            leftSection={<IconPlus size={12} />}
            disabled={!sk.trim()}
            onClick={() => addIndex('LSI')}
          >
            Add LSI
          </Button>
          {!sk.trim() && (
            <Text size="xs" c="dimmed">
              LSIs require a table sort key.
            </Text>
          )}
        </Group>

        {indexes.map((d, idx) => (
          <Group key={idx} align="flex-end" gap="xs">
            <Text size="xs" w={34} c="dimmed" mb={6}>
              {d.scope}
            </Text>
            <TextInput
              size="xs"
              label="Name"
              value={d.indexName}
              onChange={(e) => setIndex(idx, { indexName: e.currentTarget.value })}
            />
            <TextInput
              size="xs"
              label="Partition key"
              value={d.pk}
              disabled={d.scope === 'LSI'}
              onChange={(e) => setIndex(idx, { pk: e.currentTarget.value })}
            />
            <ScalarSelect
              label="Type"
              value={d.pkType}
              onChange={(t) => setIndex(idx, { pkType: t })}
              disabled={d.scope === 'LSI'}
              size="xs"
            />
            <TextInput
              size="xs"
              label="Sort key"
              value={d.sk}
              onChange={(e) => setIndex(idx, { sk: e.currentTarget.value })}
            />
            <ScalarSelect
              label="Type"
              value={d.skType}
              onChange={(t) => setIndex(idx, { skType: t })}
              size="xs"
            />
            <Select
              size="xs"
              label="Projection"
              w={110}
              data={['ALL', 'KEYS_ONLY']}
              value={d.projection}
              allowDeselect={false}
              onChange={(v) => setIndex(idx, { projection: (v as ProjectionType) ?? 'ALL' })}
            />
            <ActionIcon
              color="red"
              variant="subtle"
              mb={4}
              onClick={() => setIndexes((ix) => ix.filter((_, i) => i !== idx))}
            >
              <IconTrash size={14} />
            </ActionIcon>
          </Group>
        ))}

        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending}>
            Create table
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

function ScalarSelect({
  label,
  value,
  onChange,
  disabled,
  size = 'sm'
}: {
  label: string
  value: ScalarType
  onChange: (v: ScalarType) => void
  disabled?: boolean
  size?: string
}): JSX.Element {
  return (
    <Select
      size={size}
      label={label}
      w={80}
      data={['S', 'N', 'B']}
      value={value}
      disabled={disabled}
      allowDeselect={false}
      onChange={(v) => onChange((v as ScalarType) ?? 'S')}
    />
  )
}
