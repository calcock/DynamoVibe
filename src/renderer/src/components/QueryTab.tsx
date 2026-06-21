import { useCallback, useMemo, useState } from 'react'
import {
  ActionIcon,
  Box,
  Button,
  Code,
  Group,
  NumberInput,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput
} from '@mantine/core'
import {
  IconArrowsSort,
  IconDownload,
  IconPlayerPlay,
  IconPlus,
  IconTrash
} from '@tabler/icons-react'
import type { DocItem } from '@shared/marshal'
import type { ConnectionConfig, KeySchemaElement, TableDescription } from '@shared/types'
import {
  buildExpression,
  type FilterConditionForm,
  type FilterOperator,
  type GuidedQueryForm,
  type SkOperator,
  type ValueType
} from '../lib/expressionBuilder'
import { useDataPager } from '../hooks/useDataPager'
import { DataGrid } from './DataGrid'
import { CodeEditor } from './CodeEditor'
import { notifyError } from '../lib/notify'
import type { ItemEditorRequest } from './TableWorkspace'

const VALUE_TYPES: ValueType[] = ['S', 'N', 'BOOL']
const SK_OPS: SkOperator[] = ['=', '<', '<=', '>', '>=', 'begins_with', 'between']
const FILTER_OPS: FilterOperator[] = [
  '=',
  '<>',
  '<',
  '<=',
  '>',
  '>=',
  'begins_with',
  'contains',
  'attribute_exists',
  'attribute_not_exists'
]

export function QueryTab({
  connection,
  table,
  onEditItem
}: {
  connection: ConnectionConfig
  table: TableDescription
  onEditItem: (req: ItemEditorRequest) => void
}): JSX.Element {
  return (
    <Tabs defaultValue="guided" style={{ height: '100%' }} keepMounted={false}>
      <Tabs.List>
        <Tabs.Tab value="guided">Guided</Tabs.Tab>
        <Tabs.Tab value="partiql">PartiQL</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="guided" style={{ height: 'calc(100% - 38px)' }}>
        <GuidedPanel connection={connection} table={table} onEditItem={onEditItem} />
      </Tabs.Panel>
      <Tabs.Panel value="partiql" style={{ height: 'calc(100% - 38px)' }}>
        <PartiqlPanel connection={connection} table={table} onEditItem={onEditItem} />
      </Tabs.Panel>
    </Tabs>
  )
}

interface IndexChoice {
  value: string
  label: string
  keySchema: KeySchemaElement[]
}

function GuidedPanel({
  connection,
  table,
  onEditItem
}: {
  connection: ConnectionConfig
  table: TableDescription
  onEditItem: (req: ItemEditorRequest) => void
}): JSX.Element {
  const indexChoices = useMemo<IndexChoice[]>(() => {
    const base: IndexChoice = {
      value: '',
      label: '(table) primary key',
      keySchema: table.keySchema
    }
    const gsis = table.globalSecondaryIndexes.map((g) => ({
      value: g.indexName,
      label: `GSI: ${g.indexName}`,
      keySchema: g.keySchema
    }))
    const lsis = table.localSecondaryIndexes.map((l) => ({
      value: l.indexName,
      label: `LSI: ${l.indexName}`,
      keySchema: l.keySchema
    }))
    return [base, ...gsis, ...lsis]
  }, [table])

  const [indexName, setIndexName] = useState('')
  const selectedIndex = indexChoices.find((c) => c.value === indexName) ?? indexChoices[0]
  const pkAttr = selectedIndex.keySchema.find((k) => k.keyType === 'HASH')
  const skAttr = selectedIndex.keySchema.find((k) => k.keyType === 'RANGE')

  const [mode, setMode] = useState<'query' | 'scan'>('query')
  const [pkValue, setPkValue] = useState('')
  const [pkType, setPkType] = useState<ValueType>('S')
  const [skOperator, setSkOperator] = useState<SkOperator>('=')
  const [skValue, setSkValue] = useState('')
  const [skValue2, setSkValue2] = useState('')
  const [skType, setSkType] = useState<ValueType>('S')
  const [filterConjunction, setFilterConjunction] = useState<'AND' | 'OR'>('AND')
  const [filters, setFilters] = useState<FilterConditionForm[]>([])
  const [pageSize, setPageSize] = useState(50)
  const [scanForward, setScanForward] = useState(true)

  const form: GuidedQueryForm = {
    mode,
    key:
      mode === 'query' && pkAttr
        ? {
            pkName: pkAttr.attributeName,
            pkValue,
            pkType,
            skName: skAttr?.attributeName,
            skOperator: skAttr ? skOperator : undefined,
            skValue,
            skValue2,
            skType
          }
        : undefined,
    filterConjunction,
    filters
  }

  const built = buildExpression(form)

  const fetcher = useCallback(
    (exclusiveStartKey?: Record<string, unknown>) => {
      const params = {
        connectionId: connection.id,
        tableName: table.tableName,
        indexName: indexName || undefined,
        filterExpression: built.filterExpression,
        keyConditionExpression: built.keyConditionExpression,
        expressionAttributeNames:
          Object.keys(built.expressionAttributeNames).length > 0
            ? built.expressionAttributeNames
            : undefined,
        expressionAttributeValues:
          Object.keys(built.expressionAttributeValues).length > 0
            ? built.expressionAttributeValues
            : undefined,
        limit: pageSize,
        exclusiveStartKey,
        scanIndexForward: scanForward
      }
      return mode === 'query' ? window.api.query(params) : window.api.scan(params)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      connection.id,
      table.tableName,
      indexName,
      mode,
      pageSize,
      scanForward,
      JSON.stringify(built)
    ]
  )

  const pager = useDataPager(fetcher)

  const setFilter = (idx: number, patch: Partial<FilterConditionForm>): void =>
    setFilters((fs) => fs.map((f, i) => (i === idx ? { ...f, ...patch } : f)))

  return (
    <Stack gap={0} h="100%">
      <Box p="sm" style={{ flexShrink: 0, borderBottom: '1px solid var(--mantine-color-dark-5)', maxHeight: '55%', overflow: 'auto' }}>
        <Group align="flex-end" gap="xs">
          <Select
            size="xs"
            label="Operation"
            w={110}
            data={[
              { value: 'query', label: 'Query' },
              { value: 'scan', label: 'Scan' }
            ]}
            value={mode}
            allowDeselect={false}
            onChange={(v) => setMode(v as 'query' | 'scan')}
          />
          <Select
            size="xs"
            label="Table / index"
            w={230}
            data={indexChoices.map((c) => ({ value: c.value, label: c.label }))}
            value={indexName}
            allowDeselect={false}
            onChange={(v) => setIndexName(v ?? '')}
          />
          {mode === 'query' && (
            <ActionIcon
              variant={scanForward ? 'subtle' : 'light'}
              color="blue"
              mb={2}
              title={scanForward ? 'Ascending' : 'Descending'}
              onClick={() => setScanForward((s) => !s)}
            >
              <IconArrowsSort size={16} />
            </ActionIcon>
          )}
        </Group>

        {mode === 'query' && pkAttr && (
          <Group align="flex-end" gap="xs" mt="xs">
            <TextInput
              size="xs"
              label={`Partition key (${pkAttr.attributeName})`}
              w={220}
              value={pkValue}
              onChange={(e) => setPkValue(e.currentTarget.value)}
            />
            <TypeSelect value={pkType} onChange={setPkType} />
            {skAttr && (
              <>
                <Select
                  size="xs"
                  label={`Sort key (${skAttr.attributeName})`}
                  w={130}
                  data={SK_OPS}
                  value={skOperator}
                  allowDeselect={false}
                  onChange={(v) => setSkOperator(v as SkOperator)}
                />
                <TextInput
                  size="xs"
                  label="Value"
                  w={150}
                  value={skValue}
                  onChange={(e) => setSkValue(e.currentTarget.value)}
                />
                {skOperator === 'between' && (
                  <TextInput
                    size="xs"
                    label="and"
                    w={150}
                    value={skValue2}
                    onChange={(e) => setSkValue2(e.currentTarget.value)}
                  />
                )}
                <TypeSelect value={skType} onChange={setSkType} />
              </>
            )}
          </Group>
        )}

        <Group justify="space-between" mt="md" mb={4}>
          <Group gap="xs">
            <Text size="xs" fw={600}>
              Filters
            </Text>
            {filters.length > 1 && (
              <Select
                size="xs"
                w={80}
                data={['AND', 'OR']}
                value={filterConjunction}
                allowDeselect={false}
                onChange={(v) => setFilterConjunction((v as 'AND' | 'OR') ?? 'AND')}
              />
            )}
          </Group>
          <Button
            size="compact-xs"
            variant="light"
            leftSection={<IconPlus size={12} />}
            onClick={() =>
              setFilters((fs) => [
                ...fs,
                { attribute: '', operator: '=', value: '', valueType: 'S' }
              ])
            }
          >
            Add filter
          </Button>
        </Group>

        {filters.map((f, idx) => {
          const noValue =
            f.operator === 'attribute_exists' || f.operator === 'attribute_not_exists'
          return (
            <Group key={idx} gap="xs" mb={4} align="flex-end">
              <TextInput
                size="xs"
                placeholder="attribute"
                w={160}
                value={f.attribute}
                onChange={(e) => setFilter(idx, { attribute: e.currentTarget.value })}
              />
              <Select
                size="xs"
                w={150}
                data={FILTER_OPS}
                value={f.operator}
                allowDeselect={false}
                onChange={(v) => setFilter(idx, { operator: v as FilterOperator })}
              />
              {!noValue && (
                <>
                  <TextInput
                    size="xs"
                    placeholder="value"
                    w={150}
                    value={f.value ?? ''}
                    onChange={(e) => setFilter(idx, { value: e.currentTarget.value })}
                  />
                  <TypeSelect
                    value={f.valueType ?? 'S'}
                    onChange={(t) => setFilter(idx, { valueType: t })}
                  />
                </>
              )}
              <ActionIcon
                color="red"
                variant="subtle"
                onClick={() => setFilters((fs) => fs.filter((_, i) => i !== idx))}
              >
                <IconTrash size={14} />
              </ActionIcon>
            </Group>
          )
        })}

        <Group align="flex-end" gap="xs" mt="md">
          <Button
            size="compact-sm"
            leftSection={<IconPlayerPlay size={14} />}
            onClick={pager.run}
            loading={pager.loading}
          >
            Run {mode}
          </Button>
          <NumberInput
            size="xs"
            w={110}
            min={1}
            max={1000}
            prefix="Limit "
            value={pageSize}
            onChange={(v) => setPageSize(Number(v) || 50)}
          />
          <Text size="xs" c="dimmed">
            {pager.items.length} loaded · {pager.scannedCount} scanned
          </Text>
        </Group>

        <Stack gap={2} mt="xs">
          {built.keyConditionExpression && (
            <ExprLine label="KeyConditionExpression" value={built.keyConditionExpression} />
          )}
          {built.filterExpression && (
            <ExprLine label="FilterExpression" value={built.filterExpression} />
          )}
        </Stack>
      </Box>

      <Box style={{ flex: 1, minHeight: 0 }}>
        <DataGrid
          connectionId={connection.id}
          tableName={table.tableName}
          items={pager.items}
          keySchema={table.keySchema}
          readOnly={connection.readOnly}
          onEditItem={(item) => onEditItem({ mode: 'edit', item })}
          onDuplicateItem={(item) => onEditItem({ mode: 'new', item })}
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

function TypeSelect({
  value,
  onChange
}: {
  value: ValueType
  onChange: (v: ValueType) => void
}): JSX.Element {
  return (
    <Select
      size="xs"
      w={72}
      label={undefined}
      data={VALUE_TYPES}
      value={value}
      allowDeselect={false}
      onChange={(v) => onChange((v as ValueType) ?? 'S')}
    />
  )
}

function ExprLine({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <Group gap={6} wrap="nowrap">
      <Text size="xs" c="dimmed" w={170} style={{ flexShrink: 0 }}>
        {label}
      </Text>
      <Code fz={11} style={{ flex: 1 }}>
        {value}
      </Code>
    </Group>
  )
}

function PartiqlPanel({
  connection,
  table,
  onEditItem
}: {
  connection: ConnectionConfig
  table: TableDescription
  onEditItem: (req: ItemEditorRequest) => void
}): JSX.Element {
  const [statement, setStatement] = useState(
    `SELECT * FROM "${table.tableName}"`
  )
  const [items, setItems] = useState<DocItem[]>([])
  const [nextToken, setNextToken] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)

  const looksLikeScan =
    /\bselect\b/i.test(statement) && !/\bwhere\b/i.test(statement)

  const run = async (append: boolean): Promise<void> => {
    setLoading(true)
    try {
      const res = await window.api.partiql({
        connectionId: connection.id,
        statement,
        nextToken: append ? nextToken : undefined
      })
      const rows = res.items as DocItem[]
      setItems((prev) => (append ? [...prev, ...rows] : rows))
      setNextToken(res.nextToken)
    } catch (e) {
      notifyError('PartiQL failed', e)
      if (!append) setItems([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <Stack gap={0} h="100%">
      <Box style={{ flexShrink: 0, height: 150, borderBottom: '1px solid var(--mantine-color-dark-5)' }}>
        <CodeEditor value={statement} onChange={setStatement} language="sql" />
      </Box>
      <Group px="sm" py={6} gap="xs" style={{ flexShrink: 0 }}>
        <Button
          size="compact-sm"
          leftSection={<IconPlayerPlay size={14} />}
          onClick={() => run(false)}
          loading={loading}
        >
          Run
        </Button>
        {looksLikeScan && (
          <Text size="xs" c="orange">
            ⚠ No WHERE clause — this will scan the entire table.
          </Text>
        )}
        <Text size="xs" c="dimmed" ml="auto">
          {items.length} rows
        </Text>
      </Group>
      <Box style={{ flex: 1, minHeight: 0 }}>
        <DataGrid
          connectionId={connection.id}
          tableName={table.tableName}
          items={items}
          keySchema={table.keySchema}
          readOnly={connection.readOnly}
          onEditItem={(item) => onEditItem({ mode: 'edit', item })}
        />
      </Box>
      {nextToken && (
        <Group justify="center" py={6} style={{ flexShrink: 0 }}>
          <Button
            size="compact-sm"
            variant="subtle"
            leftSection={<IconDownload size={14} />}
            onClick={() => run(true)}
            loading={loading}
          >
            Load more
          </Button>
        </Group>
      )}
    </Stack>
  )
}
