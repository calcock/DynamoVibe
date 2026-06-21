import type { DocValue } from '@shared/marshal'

export type ValueType = 'S' | 'N' | 'BOOL'

export type SkOperator =
  | '='
  | '<'
  | '<='
  | '>'
  | '>='
  | 'begins_with'
  | 'between'

export type FilterOperator =
  | '='
  | '<>'
  | '<'
  | '<='
  | '>'
  | '>='
  | 'begins_with'
  | 'contains'
  | 'attribute_exists'
  | 'attribute_not_exists'

export interface KeyConditionForm {
  pkName: string
  pkValue: string
  pkType: ValueType
  skName?: string
  skOperator?: SkOperator
  skValue?: string
  skValue2?: string
  skType?: ValueType
}

export interface FilterConditionForm {
  attribute: string
  operator: FilterOperator
  value?: string
  valueType?: ValueType
}

export interface GuidedQueryForm {
  mode: 'query' | 'scan'
  key?: KeyConditionForm
  filterConjunction: 'AND' | 'OR'
  filters: FilterConditionForm[]
}

export interface BuiltExpression {
  keyConditionExpression?: string
  filterExpression?: string
  expressionAttributeNames: Record<string, string>
  expressionAttributeValues: Record<string, DocValue>
}

export function coerceValue(raw: string, type: ValueType): DocValue {
  if (type === 'N') {
    if (raw.trim() === '') return 0
    return Number(raw)
  }
  if (type === 'BOOL') return raw === 'true'
  return raw
}

class NameValueAllocator {
  names: Record<string, string> = {}
  values: Record<string, DocValue> = {}
  private nameByAttr = new Map<string, string>()
  private n = 0

  name(attr: string): string {
    const existing = this.nameByAttr.get(attr)
    if (existing) return existing
    const token = `#n${this.nameByAttr.size}`
    this.names[token] = attr
    this.nameByAttr.set(attr, token)
    return token
  }

  value(v: DocValue): string {
    const token = `:v${this.n++}`
    this.values[token] = v
    return token
  }
}

export function buildExpression(form: GuidedQueryForm): BuiltExpression {
  const alloc = new NameValueAllocator()
  let keyConditionExpression: string | undefined

  if (form.mode === 'query' && form.key && form.key.pkName) {
    const k = form.key
    const parts = [
      `${alloc.name(k.pkName)} = ${alloc.value(coerceValue(k.pkValue, k.pkType))}`
    ]
    if (k.skName && k.skOperator) {
      const skType = k.skType ?? 'S'
      const n = alloc.name(k.skName)
      if (k.skOperator === 'begins_with') {
        parts.push(`begins_with(${n}, ${alloc.value(coerceValue(k.skValue ?? '', skType))})`)
      } else if (k.skOperator === 'between') {
        const lo = alloc.value(coerceValue(k.skValue ?? '', skType))
        const hi = alloc.value(coerceValue(k.skValue2 ?? '', skType))
        parts.push(`${n} BETWEEN ${lo} AND ${hi}`)
      } else {
        parts.push(`${n} ${k.skOperator} ${alloc.value(coerceValue(k.skValue ?? '', skType))}`)
      }
    }
    keyConditionExpression = parts.join(' AND ')
  }

  const filterParts: string[] = []
  for (const f of form.filters) {
    if (!f.attribute) continue
    const n = alloc.name(f.attribute)
    const vt = f.valueType ?? 'S'
    switch (f.operator) {
      case 'attribute_exists':
        filterParts.push(`attribute_exists(${n})`)
        break
      case 'attribute_not_exists':
        filterParts.push(`attribute_not_exists(${n})`)
        break
      case 'begins_with':
        filterParts.push(`begins_with(${n}, ${alloc.value(coerceValue(f.value ?? '', vt))})`)
        break
      case 'contains':
        filterParts.push(`contains(${n}, ${alloc.value(coerceValue(f.value ?? '', vt))})`)
        break
      default:
        filterParts.push(`${n} ${f.operator} ${alloc.value(coerceValue(f.value ?? '', vt))}`)
    }
  }
  const filterExpression =
    filterParts.length > 0
      ? filterParts.join(` ${form.filterConjunction} `)
      : undefined

  return {
    keyConditionExpression,
    filterExpression,
    expressionAttributeNames: alloc.names,
    expressionAttributeValues: alloc.values
  }
}
