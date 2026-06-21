import type { DocItem } from '@shared/marshal'
import type { KeySchemaElement } from '@shared/types'

/** Extract just the key attributes from a document-form item. */
export function extractKey(
  item: DocItem,
  keySchema: KeySchemaElement[]
): Record<string, unknown> {
  const key: Record<string, unknown> = {}
  for (const k of keySchema) key[k.attributeName] = item[k.attributeName]
  return key
}

/** Human-readable description of an item's key, for confirm dialogs. */
export function describeKey(
  item: DocItem,
  keySchema: KeySchemaElement[]
): string {
  return keySchema
    .map((k) => `${k.attributeName}=${JSON.stringify(item[k.attributeName])}`)
    .join(', ')
}
