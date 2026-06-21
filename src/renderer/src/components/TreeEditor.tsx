import {
  ActionIcon,
  Box,
  Button,
  Group,
  Select,
  Switch,
  TagsInput,
  Text,
  TextInput
} from '@mantine/core'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import {
  ALL_EDIT_TYPES,
  emptyNodeOfType,
  nextId,
  type EditNode,
  type EditType
} from '../lib/editModel'

export type Entry = { id: string; key: string; node: EditNode }

const TYPE_OPTIONS = ALL_EDIT_TYPES.map((t) => ({ value: t, label: t }))

export function TreeEditor({
  entries,
  onChange,
  lockedKeys = []
}: {
  entries: Entry[]
  onChange: (entries: Entry[]) => void
  /** Key attribute names that cannot be renamed/removed (edit mode). */
  lockedKeys?: string[]
}): JSX.Element {
  const update = (id: string, patch: Partial<Entry>): void =>
    onChange(entries.map((e) => (e.id === id ? { ...e, ...patch } : e)))

  const remove = (id: string): void => onChange(entries.filter((e) => e.id !== id))

  const add = (): void =>
    onChange([
      ...entries,
      { id: nextId(), key: '', node: emptyNodeOfType('S') }
    ])

  return (
    <Box>
      {entries.map((e) => (
        <Group key={e.id} gap={6} align="flex-start" wrap="nowrap" mb={6}>
          <TextInput
            size="xs"
            placeholder="attribute"
            w={180}
            value={e.key}
            disabled={lockedKeys.includes(e.key)}
            onChange={(ev) => update(e.id, { key: ev.currentTarget.value })}
          />
          <NodeEditor
            node={e.node}
            onChange={(node) => update(e.id, { node })}
          />
          <ActionIcon
            color="red"
            variant="subtle"
            size="sm"
            mt={2}
            disabled={lockedKeys.includes(e.key)}
            onClick={() => remove(e.id)}
          >
            <IconTrash size={14} />
          </ActionIcon>
        </Group>
      ))}
      <Button
        size="compact-xs"
        variant="light"
        leftSection={<IconPlus size={12} />}
        onClick={add}
        mt={4}
      >
        Add attribute
      </Button>
    </Box>
  )
}

function NodeEditor({
  node,
  onChange
}: {
  node: EditNode
  onChange: (node: EditNode) => void
}): JSX.Element {
  const changeType = (type: EditType): void => {
    const fresh = emptyNodeOfType(type)
    // Best-effort value carry-over between scalar string-ish types.
    if (
      (type === 'S' || type === 'N' || type === 'B') &&
      (node.type === 'S' || node.type === 'N')
    ) {
      if (type === 'B') return onChange({ ...fresh, id: node.id } as EditNode)
      return onChange({ id: node.id, type, value: node.value } as EditNode)
    }
    onChange({ ...fresh, id: node.id })
  }

  return (
    <Box style={{ flex: 1 }}>
      <Group gap={6} align="flex-start" wrap="nowrap">
        <Select
          size="xs"
          w={84}
          data={TYPE_OPTIONS}
          value={node.type}
          allowDeselect={false}
          onChange={(v) => v && changeType(v as EditType)}
        />
        <Box style={{ flex: 1 }}>
          <ValueEditor node={node} onChange={onChange} />
        </Box>
      </Group>
    </Box>
  )
}

function ValueEditor({
  node,
  onChange
}: {
  node: EditNode
  onChange: (node: EditNode) => void
}): JSX.Element {
  switch (node.type) {
    case 'S':
      return (
        <TextInput
          size="xs"
          placeholder="string value"
          value={node.value}
          onChange={(e) => onChange({ ...node, value: e.currentTarget.value })}
        />
      )
    case 'N':
      return (
        <TextInput
          size="xs"
          placeholder="number (kept exact)"
          value={node.value}
          onChange={(e) => onChange({ ...node, value: e.currentTarget.value })}
        />
      )
    case 'BOOL':
      return (
        <Switch
          size="sm"
          mt={4}
          checked={node.value}
          label={node.value ? 'true' : 'false'}
          onChange={(e) => onChange({ ...node, value: e.currentTarget.checked })}
        />
      )
    case 'NULL':
      return (
        <Text size="xs" c="dimmed" mt={4}>
          null
        </Text>
      )
    case 'B':
      return (
        <TextInput
          size="xs"
          placeholder="base64 bytes"
          value={node.b64}
          onChange={(e) => onChange({ ...node, b64: e.currentTarget.value })}
        />
      )
    case 'SS':
    case 'NS':
      return (
        <TagsInput
          size="xs"
          placeholder={node.type === 'NS' ? 'number values' : 'string values'}
          value={node.values}
          onChange={(values) => onChange({ ...node, values })}
        />
      )
    case 'BS':
      return (
        <TagsInput
          size="xs"
          placeholder="base64 values"
          value={node.b64}
          onChange={(b64) => onChange({ ...node, b64 })}
        />
      )
    case 'L':
      return <ListEditor node={node} onChange={onChange} />
    case 'M':
      return <MapEditor node={node} onChange={onChange} />
  }
}

function ListEditor({
  node,
  onChange
}: {
  node: Extract<EditNode, { type: 'L' }>
  onChange: (node: EditNode) => void
}): JSX.Element {
  const setItem = (idx: number, child: EditNode): void =>
    onChange({ ...node, items: node.items.map((it, i) => (i === idx ? child : it)) })
  const removeItem = (idx: number): void =>
    onChange({ ...node, items: node.items.filter((_, i) => i !== idx) })
  const addItem = (): void =>
    onChange({ ...node, items: [...node.items, emptyNodeOfType('S')] })

  return (
    <Box pl="sm" style={{ borderLeft: '2px solid var(--mantine-color-dark-4)' }}>
      {node.items.map((it, idx) => (
        <Group key={it.id} gap={6} align="flex-start" wrap="nowrap" mb={6}>
          <Text size="xs" c="dimmed" mt={6} w={20}>
            {idx}
          </Text>
          <NodeEditor node={it} onChange={(c) => setItem(idx, c)} />
          <ActionIcon
            color="red"
            variant="subtle"
            size="sm"
            mt={2}
            onClick={() => removeItem(idx)}
          >
            <IconTrash size={14} />
          </ActionIcon>
        </Group>
      ))}
      <Button
        size="compact-xs"
        variant="subtle"
        leftSection={<IconPlus size={12} />}
        onClick={addItem}
      >
        Add list item
      </Button>
    </Box>
  )
}

function MapEditor({
  node,
  onChange
}: {
  node: Extract<EditNode, { type: 'M' }>
  onChange: (node: EditNode) => void
}): JSX.Element {
  return (
    <Box pl="sm" style={{ borderLeft: '2px solid var(--mantine-color-dark-4)' }}>
      <TreeEditor
        entries={node.entries}
        onChange={(entries) => onChange({ ...node, entries })}
      />
    </Box>
  )
}
