import { describe, it, expect } from 'vitest'
import { buildExpression, type GuidedQueryForm } from './expressionBuilder'

describe('buildExpression', () => {
  it('builds a PK-only query', () => {
    const form: GuidedQueryForm = {
      mode: 'query',
      key: { pkName: 'pk', pkValue: 'user#1', pkType: 'S' },
      filterConjunction: 'AND',
      filters: []
    }
    const r = buildExpression(form)
    expect(r.keyConditionExpression).toBe('#n0 = :v0')
    expect(r.expressionAttributeNames).toEqual({ '#n0': 'pk' })
    expect(r.expressionAttributeValues).toEqual({ ':v0': 'user#1' })
    expect(r.filterExpression).toBeUndefined()
  })

  it('builds a query with a begins_with sort key and a filter', () => {
    const form: GuidedQueryForm = {
      mode: 'query',
      key: {
        pkName: 'pk',
        pkValue: 'user#1',
        pkType: 'S',
        skName: 'sk',
        skOperator: 'begins_with',
        skValue: 'order#',
        skType: 'S'
      },
      filterConjunction: 'AND',
      filters: [{ attribute: 'total', operator: '>', value: '100', valueType: 'N' }]
    }
    const r = buildExpression(form)
    expect(r.keyConditionExpression).toBe('#n0 = :v0 AND begins_with(#n1, :v1)')
    expect(r.filterExpression).toBe('#n2 > :v2')
    expect(r.expressionAttributeValues[':v2']).toBe(100)
  })

  it('builds a between sort key condition', () => {
    const form: GuidedQueryForm = {
      mode: 'query',
      key: {
        pkName: 'pk',
        pkValue: 'a',
        pkType: 'S',
        skName: 'ts',
        skOperator: 'between',
        skValue: '1',
        skValue2: '9',
        skType: 'N'
      },
      filterConjunction: 'AND',
      filters: []
    }
    const r = buildExpression(form)
    expect(r.keyConditionExpression).toBe('#n0 = :v0 AND #n1 BETWEEN :v1 AND :v2')
    expect(r.expressionAttributeValues).toMatchObject({ ':v1': 1, ':v2': 9 })
  })

  it('builds scan filters with OR and existence checks', () => {
    const form: GuidedQueryForm = {
      mode: 'scan',
      filterConjunction: 'OR',
      filters: [
        { attribute: 'status', operator: '=', value: 'active', valueType: 'S' },
        { attribute: 'archived', operator: 'attribute_not_exists' }
      ]
    }
    const r = buildExpression(form)
    expect(r.keyConditionExpression).toBeUndefined()
    expect(r.filterExpression).toBe('#n0 = :v0 OR attribute_not_exists(#n1)')
  })
})
