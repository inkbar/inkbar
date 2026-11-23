import { describe, expect, it } from 'vitest'

import { destinationFromArray } from './destination'

describe('destinationFromArray', () => {
  it('reads each of the eight fits', () => {
    expect(destinationFromArray([1, { name: 'XYZ' }, 72, 500, 2], 5)).toEqual({
      page: 1,
      fit: 'xyz',
      left: 72,
      top: 500,
      zoom: 2,
    })
    expect(destinationFromArray([1, { name: 'Fit' }], 5)).toEqual({ page: 1, fit: 'fit' })
    expect(destinationFromArray([1, { name: 'FitB' }], 5)).toEqual({
      page: 1,
      fit: 'fitb',
    })
    expect(destinationFromArray([1, { name: 'FitH' }, 600], 5)).toEqual({
      page: 1,
      fit: 'fith',
      top: 600,
    })
    expect(destinationFromArray([1, { name: 'FitBH' }, 50], 5)).toEqual({
      page: 1,
      fit: 'fitbh',
      top: 50,
    })
    expect(destinationFromArray([1, { name: 'FitV' }, 144], 5)).toEqual({
      page: 1,
      fit: 'fitv',
      left: 144,
    })
    expect(destinationFromArray([1, { name: 'FitBV' }, 144], 5)).toEqual({
      page: 1,
      fit: 'fitbv',
      left: 144,
    })
    expect(destinationFromArray([3, { name: 'FitR' }, 72, 100, 300, 400], 5)).toEqual({
      page: 3,
      fit: 'fitr',
      rect: { x: 72, y: 100, width: 228, height: 300 },
    })
  })

  it('puts the corners of a FitR given the other way round in order', () => {
    expect(destinationFromArray([1, { name: 'FitR' }, 300, 400, 72, 100], 5)).toEqual({
      page: 1,
      fit: 'fitr',
      rect: { x: 72, y: 100, width: 228, height: 300 },
    })
  })

  it('gives undefined for a FitR that lacks a corner', () => {
    expect(destinationFromArray([0, { name: 'FitR' }, 1, 2], 5)).toBeUndefined()
    expect(destinationFromArray([0, { name: 'FitR' }, 1, 2, null, 4], 5)).toBeUndefined()
  })

  it('gives undefined for a page not in the document', () => {
    expect(destinationFromArray([-1, { name: 'Fit' }], 5)).toBeUndefined()
    expect(destinationFromArray([5, { name: 'Fit' }], 5)).toBeUndefined()
    expect(destinationFromArray([1.5, { name: 'Fit' }], 5)).toBeUndefined()
    expect(destinationFromArray([], 5)).toBeUndefined()
    expect(destinationFromArray(['1', { name: 'Fit' }], 5)).toBeUndefined()
  })

  it('takes a misspelt, missing or bare fit as fit', () => {
    expect(destinationFromArray([2, { name: 'Bogus' }], 5)).toEqual({
      page: 2,
      fit: 'fit',
    })
    expect(destinationFromArray([2], 5)).toEqual({ page: 2, fit: 'fit' })
    expect(destinationFromArray([2, 'Fit'], 5)).toEqual({ page: 2, fit: 'fit' })
    expect(destinationFromArray([2, { name: 'xyz' }, 10], 5)).toEqual({
      page: 2,
      fit: 'xyz',
      left: 10,
      top: undefined,
      zoom: undefined,
    })
  })

  it('leaves null coordinates undefined', () => {
    expect(destinationFromArray([0, { name: 'XYZ' }, null, 700, null], 5)).toEqual({
      page: 0,
      fit: 'xyz',
      left: undefined,
      top: 700,
      zoom: undefined,
    })
    expect(destinationFromArray([2, { name: 'FitBV' }, null], 5)).toEqual({
      page: 2,
      fit: 'fitbv',
      left: undefined,
    })
    expect(destinationFromArray([2, { name: 'FitH' }, 'junk'], 5)).toEqual({
      page: 2,
      fit: 'fith',
      top: undefined,
    })
  })
})
