import type { DocItem, DocValue } from '@shared/marshal'
import { isTagged } from './docValue'

/**
 * A mutable-friendly editor model for the tree editor. Unlike the document
 * form, Map entries are an ordered array of {key, node} so keys can be renamed
 * and reordered, and every node has a stable id for React reconciliation.
 * Numbers are kept as strings to preserve precision while editing.
 */
export type EditNode =
  | { id: string; type: 'S'; value: string }
  | { id: string; type: 'N'; value: string }
  | { id: string; type: 'BOOL'; value: boolean }
  | { id: string; type: 'NULL' }
  | { id: string; type: 'B'; b64: string }
  | { id: string; type: 'SS'; values: string[] }
  | { id: string; type: 'NS'; values: string[] }
  | { id: string; type: 'BS'; b64: string[] }
  | { id: string; type: 'M'; entries: { id: string; key: string; node: EditNode }[] }
  | { id: string; type: 'L'; items: EditNode[] }

export type EditType = EditNode['type']

let counter = 0
export const nextId = (): string => `n${counter++}`

export function docValueToNode(v: DocValue): EditNode {
  if (v === null) return { id: nextId(), type: 'NULL' }
  if (typeof v === 'string') return { id: nextId(), type: 'S', value: v }
  if (typeof v === 'number') return { id: nextId(), type: 'N', value: String(v) }
  if (typeof v === 'boolean') return { id: nextId(), type: 'BOOL', value: v }
  if (isTagged(v)) {
    switch (v.__ddb) {
      case 'N':
        return { id: nextId(), type: 'N', value: v.value }
      case 'B':
        return { id: nextId(), type: 'B', b64: v.b64 }
      case 'SS':
        return { id: nextId(), type: 'SS', values: [...v.values] }
      case 'NS':
        return { id: nextId(), type: 'NS', values: [...v.values] }
      case 'BS':
        return { id: nextId(), type: 'BS', b64: [...v.b64] }
    }
  }
  if (Array.isArray(v)) {
    return { id: nextId(), type: 'L', items: v.map(docValueToNode) }
  }
  return {
    id: nextId(),
    type: 'M',
    entries: Object.entries(v).map(([key, val]) => ({
      id: nextId(),
      key,
      node: docValueToNode(val)
    }))
  }
}

export function nodeToDocValue(node: EditNode): DocValue {
  switch (node.type) {
    case 'S':
      return node.value
    case 'N':
      // Emit a plain number when it round-trips; otherwise keep precision tagged.
      if (String(Number(node.value)) === node.value.trim()) return Number(node.value)
      return { __ddb: 'N', value: node.value.trim() }
    case 'BOOL':
      return node.value
    case 'NULL':
      return null
    case 'B':
      return { __ddb: 'B', b64: node.b64 }
    case 'SS':
      return { __ddb: 'SS', values: node.values }
    case 'NS':
      return { __ddb: 'NS', values: node.values }
    case 'BS':
      return { __ddb: 'BS', b64: node.b64 }
    case 'L':
      return node.items.map(nodeToDocValue)
    case 'M': {
      const obj: Record<string, DocValue> = {}
      for (const e of node.entries) obj[e.key] = nodeToDocValue(e.node)
      return obj
    }
  }
}

export function docItemToEntries(
  item: DocItem
): { id: string; key: string; node: EditNode }[] {
  return Object.entries(item).map(([key, val]) => ({
    id: nextId(),
    key,
    node: docValueToNode(val)
  }))
}

export function entriesToDocItem(
  entries: { id: string; key: string; node: EditNode }[]
): DocItem {
  const item: DocItem = {}
  for (const e of entries) item[e.key] = nodeToDocValue(e.node)
  return item
}

export function emptyNodeOfType(type: EditType): EditNode {
  switch (type) {
    case 'S':
      return { id: nextId(), type: 'S', value: '' }
    case 'N':
      return { id: nextId(), type: 'N', value: '0' }
    case 'BOOL':
      return { id: nextId(), type: 'BOOL', value: false }
    case 'NULL':
      return { id: nextId(), type: 'NULL' }
    case 'B':
      return { id: nextId(), type: 'B', b64: '' }
    case 'SS':
      return { id: nextId(), type: 'SS', values: [] }
    case 'NS':
      return { id: nextId(), type: 'NS', values: [] }
    case 'BS':
      return { id: nextId(), type: 'BS', b64: [] }
    case 'L':
      return { id: nextId(), type: 'L', items: [] }
    case 'M':
      return { id: nextId(), type: 'M', entries: [] }
  }
}

export const ALL_EDIT_TYPES: EditType[] = [
  'S',
  'N',
  'BOOL',
  'NULL',
  'M',
  'L',
  'SS',
  'NS',
  'BS',
  'B'
]
