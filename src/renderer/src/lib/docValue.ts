import type { DocValue, Tagged } from '@shared/marshal'
import type { EnvLabel } from '@shared/types'

export function isTagged(v: unknown): v is Tagged {
  return typeof v === 'object' && v !== null && '__ddb' in (v as object)
}

/** A compact, single-line preview of any document value for grid cells. */
export function previewValue(v: DocValue): string {
  if (v === null) return 'NULL'
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (isTagged(v)) {
    switch (v.__ddb) {
      case 'N':
        return v.value
      case 'B':
        return `«binary ${v.b64.length}b64»`
      case 'SS':
        return `{${v.values.join(', ')}}`
      case 'NS':
        return `{${v.values.join(', ')}}`
      case 'BS':
        return `«${v.b64.length} binary»`
    }
  }
  if (Array.isArray(v)) return `[${v.length} items]`
  return `{${Object.keys(v).length} keys}`
}

/** Short type label for a document value (used by the tree editor + grid). */
export function ddbTypeOf(v: DocValue): string {
  if (v === null) return 'NULL'
  if (typeof v === 'string') return 'S'
  if (typeof v === 'number') return 'N'
  if (typeof v === 'boolean') return 'BOOL'
  if (isTagged(v)) return v.__ddb
  if (Array.isArray(v)) return 'L'
  return 'M'
}

export const ENV_COLORS: Record<EnvLabel, string> = {
  local: 'green',
  dev: 'teal',
  staging: 'yellow',
  prod: 'red',
  other: 'gray'
}
