import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Group,
  Modal,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text
} from '@mantine/core'
import { IconAlertTriangle, IconDeviceFloppy } from '@tabler/icons-react'
import {
  docItemToDocumentJson,
  docItemToWireJson,
  documentJsonToDocItem,
  wireJsonToDocItem,
  type DocItem
} from '@shared/marshal'
import type { ConnectionConfig, TableDescription } from '@shared/types'
import {
  docItemToEntries,
  entriesToDocItem
} from '../lib/editModel'
import { TreeEditor, type Entry } from './TreeEditor'
import { CodeEditor } from './CodeEditor'
import { notifyError, notifySuccess } from '../lib/notify'
import type { ItemEditorRequest } from './TableWorkspace'

type ViewMode = 'tree' | 'raw'
type RawFormat = 'document' | 'wire'

export function ItemEditor({
  connection,
  table,
  request,
  onClose
}: {
  connection: ConnectionConfig
  table: TableDescription
  request: ItemEditorRequest
  onClose: () => void
}): JSX.Element {
  const readOnly = connection.readOnly
  const isEdit = request.mode === 'edit'
  const keyNames = useMemo(
    () => table.keySchema.map((k) => k.attributeName),
    [table.keySchema]
  )

  const [view, setView] = useState<ViewMode>('tree')
  const [rawFormat, setRawFormat] = useState<RawFormat>('document')
  const [entries, setEntries] = useState<Entry[]>([])
  const [rawText, setRawText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [onlyIfNotExists, setOnlyIfNotExists] = useState(!isEdit)
  const [saving, setSaving] = useState(false)

  // Initialise from the request once.
  useEffect(() => {
    const seed: DocItem = request.item ?? {}
    setEntries(docItemToEntries(seed))
    setRawText(docItemToDocumentJson(seed))
    setRawFormat('document')
    setView('tree')
    setError(null)
    setOnlyIfNotExists(!isEdit)
  }, [request, isEdit])

  const serialize = (item: DocItem, fmt: RawFormat): string =>
    fmt === 'wire' ? docItemToWireJson(item) : docItemToDocumentJson(item)

  const parseRaw = (text: string, fmt: RawFormat): DocItem =>
    fmt === 'wire' ? wireJsonToDocItem(text) : documentJsonToDocItem(text)

  /** Pull the current document item from whichever view is active. */
  const currentItem = (): DocItem => {
    if (view === 'raw') return parseRaw(rawText, rawFormat)
    return entriesToDocItem(entries)
  }

  const switchView = (next: ViewMode): void => {
    setError(null)
    try {
      if (next === 'raw' && view === 'tree') {
        setRawText(serialize(entriesToDocItem(entries), rawFormat))
      } else if (next === 'tree' && view === 'raw') {
        setEntries(docItemToEntries(parseRaw(rawText, rawFormat)))
      }
      setView(next)
    } catch (e) {
      setError(`Cannot switch: ${(e as Error).message}`)
    }
  }

  const switchRawFormat = (next: RawFormat): void => {
    setError(null)
    try {
      const item = parseRaw(rawText, rawFormat)
      setRawText(serialize(item, next))
      setRawFormat(next)
    } catch (e) {
      setError(`Invalid JSON: ${(e as Error).message}`)
    }
  }

  const handleSave = async (): Promise<void> => {
    setError(null)
    let item: DocItem
    try {
      item = currentItem()
    } catch (e) {
      setError(`Invalid JSON: ${(e as Error).message}`)
      return
    }
    // Validate key attributes are present.
    for (const k of keyNames) {
      if (item[k] === undefined) {
        setError(`Missing key attribute: ${k}`)
        return
      }
    }
    setSaving(true)
    try {
      await window.api.putItem({
        connectionId: connection.id,
        tableName: table.tableName,
        item,
        onlyIfNotExists: !isEdit && onlyIfNotExists
      })
      notifySuccess(isEdit ? 'Item updated' : 'Item created')
      onClose()
    } catch (e) {
      notifyError('Save failed', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      opened
      onClose={onClose}
      size="xl"
      title={
        readOnly
          ? `View item · ${table.tableName}`
          : isEdit
            ? `Edit item · ${table.tableName}`
            : `New item · ${table.tableName}`
      }
      styles={{ body: { display: 'flex', flexDirection: 'column' } }}
    >
      <Stack gap="sm" style={{ minHeight: 420 }}>
        <Group justify="space-between">
          <SegmentedControl
            size="xs"
            value={view}
            onChange={(v) => switchView(v as ViewMode)}
            data={[
              { label: 'Structured', value: 'tree' },
              { label: 'Raw JSON', value: 'raw' }
            ]}
          />
          {view === 'raw' && (
            <SegmentedControl
              size="xs"
              value={rawFormat}
              onChange={(v) => switchRawFormat(v as RawFormat)}
              data={[
                { label: 'Document', value: 'document' },
                { label: 'DynamoDB JSON', value: 'wire' }
              ]}
            />
          )}
        </Group>

        {error && (
          <Alert color="red" icon={<IconAlertTriangle size={16} />} py={6}>
            {error}
          </Alert>
        )}

        {isEdit && !readOnly && (
          <Text size="xs" c="dimmed">
            Saving overwrites the existing item with the same key.
          </Text>
        )}

        <Box style={{ flex: 1, minHeight: 320 }}>
          {view === 'tree' ? (
            <ScrollArea h={360} type="auto">
              <TreeEditor
                entries={entries}
                onChange={setEntries}
                lockedKeys={isEdit ? keyNames : []}
              />
            </ScrollArea>
          ) : (
            <Box
              h={360}
              style={{
                border: '1px solid var(--mantine-color-dark-4)',
                borderRadius: 6,
                overflow: 'hidden'
              }}
            >
              <CodeEditor
                value={rawText}
                onChange={setRawText}
                language="json"
                readOnly={readOnly}
              />
            </Box>
          )}
        </Box>

        {!readOnly && (
          <Group justify="space-between">
            {!isEdit ? (
              <Checkbox
                size="xs"
                label="Only create if it doesn't already exist"
                checked={onlyIfNotExists}
                onChange={(e) => setOnlyIfNotExists(e.currentTarget.checked)}
              />
            ) : (
              <span />
            )}
            <Group>
              <Button variant="default" onClick={onClose}>
                Cancel
              </Button>
              <Button
                leftSection={<IconDeviceFloppy size={16} />}
                loading={saving}
                onClick={handleSave}
              >
                Save
              </Button>
            </Group>
          </Group>
        )}
      </Stack>
    </Modal>
  )
}
