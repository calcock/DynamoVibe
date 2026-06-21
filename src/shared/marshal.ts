/**
 * Lossless conversion between DynamoDB wire format (AttributeValue) and a
 * "document form" that is friendly to edit as JSON.
 *
 * Design: the wire format is the canonical, fully-lossless representation.
 * Document form keeps the common cases clean (strings, safe numbers, booleans,
 * nested maps/lists) and falls back to a tagged object `{ __ddb: <type>, ... }`
 * only for values JSON cannot represent faithfully: Binary, Sets, and Numbers
 * whose precision would not survive a round-trip through a JS `number`.
 *
 * Both directions are pure and total; round-tripping wire -> doc -> wire is an
 * identity for every DynamoDB type. This module is environment-agnostic (no
 * Node or DOM globals beyond base64 helpers defined here) so it is shared by
 * the main process and the renderer.
 */

// ---- Wire format (structural; mirrors @aws-sdk AttributeValue) ----

export interface WireValue {
  S?: string
  N?: string
  B?: Uint8Array
  BOOL?: boolean
  NULL?: boolean
  M?: Record<string, WireValue>
  L?: WireValue[]
  SS?: string[]
  NS?: string[]
  BS?: Uint8Array[]
}

export type WireItem = Record<string, WireValue>

// ---- Document form tagged wrappers ----

export type DdbTag = 'N' | 'B' | 'SS' | 'NS' | 'BS'

export interface TaggedNumber {
  __ddb: 'N'
  value: string
}
export interface TaggedBinary {
  __ddb: 'B'
  /** base64-encoded bytes */
  b64: string
}
export interface TaggedStringSet {
  __ddb: 'SS'
  values: string[]
}
export interface TaggedNumberSet {
  __ddb: 'NS'
  values: string[]
}
export interface TaggedBinarySet {
  __ddb: 'BS'
  /** base64-encoded byte arrays */
  b64: string[]
}

export type Tagged =
  | TaggedNumber
  | TaggedBinary
  | TaggedStringSet
  | TaggedNumberSet
  | TaggedBinarySet

export type DocValue =
  | string
  | number
  | boolean
  | null
  | Tagged
  | DocValue[]
  | { [key: string]: DocValue }

export type DocItem = Record<string, DocValue>

// ---- base64 helpers (work in both Node and browser/Electron renderer) ----

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64')
  }
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  // eslint-disable-next-line no-undef
  return btoa(binary)
}

export function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'))
  }
  // eslint-disable-next-line no-undef
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * A DynamoDB number string round-trips through a JS `number` only when the
 * canonical string of that number equals the original. Otherwise we must keep
 * it tagged to avoid silent precision loss (e.g. very large integers, trailing
 * zeros, high-precision decimals).
 */
export function numberSurvivesJsRoundTrip(n: string): boolean {
  const asNum = Number(n)
  if (!Number.isFinite(asNum)) return false
  return String(asNum) === n
}

// ---- wire -> document ----

export function wireValueToDoc(v: WireValue): DocValue {
  if (v.S !== undefined) return v.S
  if (v.BOOL !== undefined) return v.BOOL
  if (v.NULL !== undefined) return null
  if (v.N !== undefined) {
    return numberSurvivesJsRoundTrip(v.N) ? Number(v.N) : { __ddb: 'N', value: v.N }
  }
  if (v.B !== undefined) return { __ddb: 'B', b64: bytesToBase64(v.B) }
  if (v.SS !== undefined) return { __ddb: 'SS', values: [...v.SS] }
  if (v.NS !== undefined) return { __ddb: 'NS', values: [...v.NS] }
  if (v.BS !== undefined) return { __ddb: 'BS', b64: v.BS.map(bytesToBase64) }
  if (v.M !== undefined) return wireItemToDoc(v.M)
  if (v.L !== undefined) return v.L.map(wireValueToDoc)
  // Empty/unknown AttributeValue — represent as null to stay total.
  return null
}

export function wireItemToDoc(item: WireItem): DocItem {
  const out: DocItem = {}
  for (const [k, v] of Object.entries(item)) out[k] = wireValueToDoc(v)
  return out
}

// ---- document -> wire ----

function isTagged(v: unknown): v is Tagged {
  return typeof v === 'object' && v !== null && '__ddb' in (v as Record<string, unknown>)
}

export function docValueToWire(v: DocValue): WireValue {
  if (v === null) return { NULL: true }
  if (typeof v === 'string') return { S: v }
  if (typeof v === 'boolean') return { BOOL: v }
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`Cannot store non-finite number: ${v}`)
    return { N: String(v) }
  }
  if (Array.isArray(v)) return { L: v.map(docValueToWire) }
  if (isTagged(v)) {
    switch (v.__ddb) {
      case 'N':
        return { N: v.value }
      case 'B':
        return { B: base64ToBytes(v.b64) }
      case 'SS':
        return { SS: [...v.values] }
      case 'NS':
        return { NS: [...v.values] }
      case 'BS':
        return { BS: v.b64.map(base64ToBytes) }
    }
  }
  // plain object -> Map
  return { M: docItemToWire(v as DocItem) }
}

export function docItemToWire(item: DocItem): WireItem {
  const out: WireItem = {}
  for (const [k, val] of Object.entries(item)) out[k] = docValueToWire(val)
  return out
}

// ---- DynamoDB-JSON (wire format with Binary as base64 strings) ----
//
// The wire `WireValue` carries Binary as `Uint8Array`, which is not
// JSON-serializable. "DynamoDB JSON" is the same shape but with B/BS encoded as
// base64 strings, suitable for display in the raw editor's wire-format mode.

export type DdbJsonValue = {
  S?: string
  N?: string
  B?: string
  BOOL?: boolean
  NULL?: boolean
  M?: Record<string, DdbJsonValue>
  L?: DdbJsonValue[]
  SS?: string[]
  NS?: string[]
  BS?: string[]
}

export function wireValueToDdbJson(v: WireValue): DdbJsonValue {
  if (v.B !== undefined) return { B: bytesToBase64(v.B) }
  if (v.BS !== undefined) return { BS: v.BS.map(bytesToBase64) }
  if (v.M !== undefined) {
    const M: Record<string, DdbJsonValue> = {}
    for (const [k, val] of Object.entries(v.M)) M[k] = wireValueToDdbJson(val)
    return { M }
  }
  if (v.L !== undefined) return { L: v.L.map(wireValueToDdbJson) }
  // Scalars/sets that are already JSON-safe pass through unchanged.
  return v as DdbJsonValue
}

export function ddbJsonToWireValue(v: DdbJsonValue): WireValue {
  if (v.B !== undefined) return { B: base64ToBytes(v.B) }
  if (v.BS !== undefined) return { BS: v.BS.map(base64ToBytes) }
  if (v.M !== undefined) {
    const M: Record<string, WireValue> = {}
    for (const [k, val] of Object.entries(v.M)) M[k] = ddbJsonToWireValue(val)
    return { M }
  }
  if (v.L !== undefined) return { L: v.L.map(ddbJsonToWireValue) }
  return v as WireValue
}

export function wireItemToDdbJson(item: WireItem): Record<string, DdbJsonValue> {
  const out: Record<string, DdbJsonValue> = {}
  for (const [k, v] of Object.entries(item)) out[k] = wireValueToDdbJson(v)
  return out
}

export function ddbJsonToWireItem(
  item: Record<string, DdbJsonValue>
): WireItem {
  const out: WireItem = {}
  for (const [k, v] of Object.entries(item)) out[k] = ddbJsonToWireValue(v)
  return out
}

// ---- Convenience: DocItem <-> the two JSON string formats ----

export function docItemToDocumentJson(item: DocItem): string {
  return JSON.stringify(item, null, 2)
}

export function documentJsonToDocItem(text: string): DocItem {
  return JSON.parse(text) as DocItem
}

export function docItemToWireJson(item: DocItem): string {
  return JSON.stringify(wireItemToDdbJson(docItemToWire(item)), null, 2)
}

export function wireJsonToDocItem(text: string): DocItem {
  return wireItemToDoc(ddbJsonToWireItem(JSON.parse(text)))
}
