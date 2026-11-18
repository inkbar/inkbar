import { expect, test } from 'vitest'

import { CHARS } from '../text/metrics-data'

import { pdfString, winAnsi } from './win-ansi'

const hex = (bytes: Uint8Array | undefined): string[] | undefined =>
  bytes && [...bytes].map((b) => b.toString(16).toUpperCase().padStart(2, '0'))

test('winAnsi encodes ASCII, Latin-1 and the CP1252 block', () => {
  expect(hex(winAnsi('Aé€'))).toEqual(['41', 'E9', '80'])
  expect(hex(winAnsi(' ~ ÿ'))).toEqual(['20', '7E', 'A0', 'FF'])
  expect(hex(winAnsi('Œ™ž'))).toEqual(['8C', '99', '9E'])
  expect(hex(winAnsi(''))).toEqual([])
})

test('winAnsi reports text with a character it has no code for', () => {
  expect(winAnsi('日')).toBeUndefined()
  expect(winAnsi('a\tb')).toBeUndefined()
  expect(winAnsi('a\nb')).toBeUndefined()
  expect(winAnsi('\u0081')).toBeUndefined()
  expect(winAnsi('\u007f')).toBeUndefined()
  expect(winAnsi('😀')).toBeUndefined()
})

test('every character of the standard tables encodes, or is painted as a picture', () => {
  const unencodable = [...CHARS].filter((c) => winAnsi(c) === undefined)
  // The tables hold Windows ANSI's characters and no others, so none is left to a picture.
  expect(unencodable).toEqual([])
  for (const c of CHARS) expect(winAnsi(c)).toHaveLength(1)
})

test('pdfString escapes parentheses and backslashes', () => {
  expect(pdfString(winAnsi('a(b)\\c')!)).toBe('(a\\(b\\)\\\\c)')
})

test('pdfString writes bytes from 0x80 as three octal digits', () => {
  expect(pdfString(winAnsi('é')!)).toBe('(\\351)')
  expect(pdfString(new Uint8Array([0x80, 0xff]))).toBe('(\\200\\377)')
})

test('pdfString writes control bytes as octal, so no line end is changed', () => {
  expect(pdfString(new Uint8Array([0x0d, 0x0a, 0x41]))).toBe('(\\015\\012A)')
})
