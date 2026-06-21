import { describe, it, expect } from 'vitest'
import {
  WireItem,
  WireValue,
  wireItemToDoc,
  docItemToWire,
  wireValueToDoc,
  docValueToWire,
  numberSurvivesJsRoundTrip,
  bytesToBase64,
  base64ToBytes
} from './marshal'

const roundTrip = (w: WireValue): WireValue => docValueToWire(wireValueToDoc(w))

describe('numberSurvivesJsRoundTrip', () => {
  it('accepts simple safe numbers', () => {
    expect(numberSurvivesJsRoundTrip('30')).toBe(true)
    expect(numberSurvivesJsRoundTrip('3.14')).toBe(true)
    expect(numberSurvivesJsRoundTrip('-0.5')).toBe(true)
  })
  it('rejects values that lose precision or change form', () => {
    expect(numberSurvivesJsRoundTrip('99999999999999999999')).toBe(false)
    expect(numberSurvivesJsRoundTrip('1.000')).toBe(false) // trailing zeros dropped
    expect(numberSurvivesJsRoundTrip('0123')).toBe(false) // leading zero
  })
})

describe('base64 helpers', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 254, 255, 127, 128])
    expect([...base64ToBytes(bytesToBase64(bytes))]).toEqual([...bytes])
  })
})

describe('wire <-> doc round-trips', () => {
  const cases: Record<string, WireValue> = {
    string: { S: 'Bob' },
    safeNumber: { N: '30' },
    bigNumber: { N: '99999999999999999999' },
    preciseDecimal: { N: '1.0000000000000001' },
    bool: { BOOL: true },
    null: { NULL: true },
    binary: { B: new Uint8Array([1, 2, 3, 4]) },
    stringSet: { SS: ['a', 'b', 'c'] },
    numberSet: { NS: ['1', '2', '300000000000000000000'] },
    binarySet: { BS: [new Uint8Array([1]), new Uint8Array([2, 3])] },
    list: { L: [{ S: 'x' }, { N: '1' }, { BOOL: false }] },
    map: { M: { a: { S: 'y' }, b: { N: '2' } } }
  }

  for (const [name, wire] of Object.entries(cases)) {
    it(`preserves ${name}`, () => {
      expect(roundTrip(wire)).toEqual(wire)
    })
  }

  it('keeps the common case clean in document form', () => {
    expect(wireValueToDoc({ S: 'Bob' })).toBe('Bob')
    expect(wireValueToDoc({ N: '30' })).toBe(30)
    expect(wireValueToDoc({ BOOL: true })).toBe(true)
    expect(wireValueToDoc({ NULL: true })).toBe(null)
  })

  it('tags numbers that would lose precision', () => {
    expect(wireValueToDoc({ N: '99999999999999999999' })).toEqual({
      __ddb: 'N',
      value: '99999999999999999999'
    })
  })

  it('round-trips a deeply nested item', () => {
    const item: WireItem = {
      pk: { S: 'user#1' },
      sk: { S: 'profile' },
      age: { N: '42' },
      score: { N: '123456789012345678901234567890' },
      tags: { SS: ['admin', 'beta'] },
      avatar: { B: new Uint8Array([9, 8, 7]) },
      meta: {
        M: {
          active: { BOOL: true },
          nicknames: { L: [{ S: 'bobby' }, { NULL: true }] },
          counts: { NS: ['0', '10', '20'] }
        }
      }
    }
    expect(docItemToWire(wireItemToDoc(item))).toEqual(item)
  })
})
