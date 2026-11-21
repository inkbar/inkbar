import { describe, expect, it } from 'vitest'

import { cleanUri, nameBytes, rawDestination, targetFromFacts } from './targets'

import type { FileActionShape, FileTargetShape } from './types'

/** The bytes of ASCII text. */
const ascii = (text: string) => new TextEncoder().encode(text)

const action = (a: FileActionShape): FileTargetShape => ({ action: a })
const uri = (text: string) => action({ kind: 'URI', uri: ascii(text) })
const script = (source: string) => action({ kind: 'JavaScript', script: source })

const unsupported = (reason: string) => ({ kind: 'unsupported', reason })
const url = (address: string, newWindow = false) => ({
  kind: 'url',
  url: address,
  newWindow,
})

describe('cleanUri', () => {
  it('reads the bytes one character each, as PDF.js reads a string', () => {
    // 0xe9 alone is not UTF-8: it stays U+00E9, which the URL parser writes as UTF-8.
    const bytes = new Uint8Array([...ascii('https://example.com/'), 0xe9])
    expect(cleanUri(bytes)).toBe('https://example.com/%C3%A9')
  })

  it('decodes the string again as UTF-8 when its bytes are UTF-8', () => {
    const bytes = new Uint8Array([...ascii('https://example.com/'), 0xc3, 0xa9])
    // Without the second decode the two bytes would be two characters, %C3%83%C2%A9.
    expect(cleanUri(bytes)).toBe('https://example.com/%C3%A9')
  })

  it('adds http:// to an address starting www. with a second dot, as PDF.js does', () => {
    expect(cleanUri(ascii('www.example.com/path'))).toBe('http://www.example.com/path')
    // PDF.js adds the scheme only when the address has a second dot, so one dot gets none.
    expect(cleanUri(ascii('www.example'))).toBeUndefined()
  })

  it('parses the address and gives its href', () => {
    expect(cleanUri(ascii('HTTPS://Example.COM'))).toBe('https://example.com/')
    // The scheme is not judged here: that is safeUrl's job.
    expect(cleanUri(ascii('javascript:alert(1)'))).toBe('javascript:alert(1)')
  })

  it('is undefined when the URL parser refuses the address', () => {
    expect(cleanUri(ascii('not a url'))).toBeUndefined()
    expect(cleanUri(new Uint8Array([0xff, 0xfe]))).toBeUndefined()
    expect(cleanUri(new Uint8Array())).toBeUndefined()
  })
})

describe('targetFromFacts', () => {
  it('a URI action: the cleaned address when safeUrl keeps it, never in a new window', () => {
    expect(targetFromFacts(uri('https://example.com/a'))).toEqual(
      url('https://example.com/a')
    )
    expect(targetFromFacts(uri('www.example.com/path'))).toEqual(
      url('http://www.example.com/path')
    )
    expect(targetFromFacts(uri('mailto:a@example.com'))).toEqual(
      url('mailto:a@example.com')
    )
  })

  it('a URI action with an unsafe scheme is unsafe-url', () => {
    expect(targetFromFacts(uri('javascript:alert(1)'))).toEqual(unsupported('unsafe-url'))
    expect(targetFromFacts(uri('file:///etc/passwd'))).toEqual(unsupported('unsafe-url'))
    expect(targetFromFacts(uri('data:text/html,x'))).toEqual(unsupported('unsafe-url'))
    // PDF.js accepts ftp:, safeUrl does not.
    expect(targetFromFacts(uri('ftp://example.com/f'))).toEqual(unsupported('unsafe-url'))
  })

  it('a URI action the URL parser refuses is launch, as PDF.js reports it, not unsafe-url', () => {
    // PDF.js tells a refused address with no scheme by whether it has a #, so these come out
    // as launch or remote (the link-targets fixture's uri-bytes is launch).
    expect(
      targetFromFacts(action({ kind: 'URI', uri: new Uint8Array([0xff, 0xfe]) }))
    ).toEqual(unsupported('launch'))
    expect(targetFromFacts(uri('www.example'))).toEqual(unsupported('launch'))
    expect(targetFromFacts(uri('page.html#top'))).toEqual(unsupported('remote'))
  })

  it('a URI action with no address goes nowhere', () => {
    expect(targetFromFacts(action({ kind: 'URI' }))).toEqual(unsupported('unknown'))
    expect(targetFromFacts(action({ kind: 'URI', uri: new Uint8Array() }))).toEqual(
      unsupported('unknown')
    )
  })

  it('a GoTo action: dest with its destination', () => {
    expect(
      targetFromFacts(
        action({
          kind: 'GoTo',
          destination: { page: 2, fit: 'XYZ', args: [72, 500, null, null] },
        })
      )
    ).toEqual({ kind: 'dest', raw: [2, { name: 'XYZ' }, 72, 500, null] })
    expect(
      targetFromFacts(action({ kind: 'GoTo', destination: { name: ascii('chapter-2') } }))
    ).toEqual({ kind: 'dest', raw: 'chapter-2' })
    expect(targetFromFacts(action({ kind: 'GoTo' }))).toEqual(unsupported('unknown'))
  })

  it('a GoToR or Launch action whose file is an absolute address: url, newWindow as given', () => {
    expect(
      targetFromFacts(
        action({
          kind: 'GoToR',
          file: ascii('https://example.com/doc.pdf'),
          newWindow: true,
        })
      )
    ).toEqual(url('https://example.com/doc.pdf', true))
    expect(
      targetFromFacts(action({ kind: 'Launch', file: ascii('https://example.com/run') }))
    ).toEqual(url('https://example.com/run'))
    expect(
      targetFromFacts(
        action({ kind: 'Launch', file: ascii('www.example.com/run'), newWindow: false })
      )
    ).toEqual(url('http://www.example.com/run'))
  })

  it('a GoToR action with a destination in another file: the destination joins the address', () => {
    expect(
      targetFromFacts(
        action({
          kind: 'GoToR',
          file: ascii('https://example.com/doc.pdf#old'),
          destination: { name: ascii('ch1') },
        })
      )
    ).toEqual(url('https://example.com/doc.pdf#ch1'))
  })

  it('a GoToR or Launch action whose file is unsafe is unsafe-url', () => {
    expect(
      targetFromFacts(action({ kind: 'GoToR', file: ascii('file:///etc/passwd') }))
    ).toEqual(unsupported('unsafe-url'))
    expect(
      targetFromFacts(action({ kind: 'Launch', file: ascii('javascript:alert(1)') }))
    ).toEqual(unsupported('unsafe-url'))
    expect(
      targetFromFacts(
        action({ kind: 'Launch', file: new Uint8Array([0xc3, 0x28]), newWindow: true })
      )
    ).toEqual(unsupported('launch'))
    // Bytes 0xff 0xfe are an empty UTF-16LE name, which PDF.js reads as no address at all.
    expect(
      targetFromFacts(action({ kind: 'GoToR', file: new Uint8Array([0xff, 0xfe]) }))
    ).toEqual(unsupported('unknown'))
  })

  it('a GoToR action to a file with a destination is remote', () => {
    expect(
      targetFromFacts(
        action({
          kind: 'GoToR',
          file: ascii('other.pdf'),
          destination: { name: ascii('ch1') },
        })
      )
    ).toEqual(unsupported('remote'))
    expect(
      targetFromFacts(
        action({
          kind: 'GoToR',
          file: ascii('other.pdf'),
          destination: { page: 0, fit: 'Fit', args: [null, null, null, null] },
        })
      )
    ).toEqual(unsupported('remote'))
  })

  it('a GoToR action to a file with no destination is launch, as PDF.js reports it', () => {
    // PDF.js joins a GoToR's file and destination as file#dest and tells remote from launch by
    // the #, so with no destination there is no # and it is launch.
    expect(targetFromFacts(action({ kind: 'GoToR', file: ascii('other.pdf') }))).toEqual(
      unsupported('launch')
    )
    // And with no file at all, PDF.js reads nothing from it.
    expect(targetFromFacts(action({ kind: 'GoToR' }))).toEqual(unsupported('unknown'))
  })

  it('a Launch action to a file is launch', () => {
    expect(targetFromFacts(action({ kind: 'Launch', file: ascii('app.exe') }))).toEqual(
      unsupported('launch')
    )
    expect(targetFromFacts(action({ kind: 'Launch' }))).toEqual(unsupported('unknown'))
  })

  it('a file name with a byte-order mark is read as text', () => {
    const utf16 = new Uint8Array([
      0xfe,
      0xff,
      ...[...'https://example.com/u'].flatMap((c) => [0, c.charCodeAt(0)]),
    ])
    expect(targetFromFacts(action({ kind: 'Launch', file: utf16 }))).toEqual(
      url('https://example.com/u')
    )
  })

  it('a Named action: named for the four page moves, else unknown', () => {
    for (const name of ['NextPage', 'PrevPage', 'FirstPage', 'LastPage'] as const)
      expect(targetFromFacts(action({ kind: 'Named', name }))).toEqual({
        kind: 'named',
        action: name,
      })
    expect(targetFromFacts(action({ kind: 'Named', name: 'Print' }))).toEqual(
      unsupported('unknown')
    )
    expect(targetFromFacts(action({ kind: 'Named' }))).toEqual(unsupported('unknown'))
  })

  it('a JavaScript action that only opens an address: url, newWindow from launchURL', () => {
    expect(
      targetFromFacts(script("app.launchURL('https://example.com/js', true)"))
    ).toEqual(url('https://example.com/js', true))
    expect(targetFromFacts(script("app.launchURL('https://example.com/js')"))).toEqual(
      url('https://example.com/js')
    )
    expect(
      targetFromFacts(script('  app.launchURL("https://example.com/js", false)'))
    ).toEqual(url('https://example.com/js'))
    expect(targetFromFacts(script("window.open('https://example.com/open')"))).toEqual(
      url('https://example.com/open')
    )
    expect(targetFromFacts(script("window.open('www.example.com/w')"))).toEqual(
      url('http://www.example.com/w')
    )
  })

  it('also a third call PDF.js reads, xfa.host.gotoURL, and the names in any case', () => {
    // PDF.js matches it too, so a link with it goes to the same place.
    expect(targetFromFacts(script("xfa.host.gotoURL('https://example.com/x')"))).toEqual(
      url('https://example.com/x')
    )
    // Only the exact name app.launchURL opens a new window.
    expect(
      targetFromFacts(script("APP.LAUNCHURL('https://example.com/x', true)"))
    ).toEqual(url('https://example.com/x'))
  })

  it('a JavaScript action whose address is unsafe is never a url', () => {
    expect(targetFromFacts(script("app.launchURL('javascript:alert(1)')"))).toEqual(
      unsupported('unsafe-url')
    )
    expect(targetFromFacts(script("window.open('data:text/html,x')"))).toEqual(
      unsupported('unsafe-url')
    )
    expect(targetFromFacts(script("window.open('file:///etc/passwd')"))).toEqual(
      unsupported('unsafe-url')
    )
  })

  it('any other JavaScript is unknown, and is never run', () => {
    let ran = false
    ;(globalThis as { __ran?: () => void }).__ran = () => {
      ran = true
    }
    try {
      for (const source of [
        "app.alert('x')",
        "__ran(); app.launchURL('https://example.com/js')",
        "app.launchURL('https://example.com/js'); __ran()",
        '__ran()',
        "app.launchURL(__ran() || 'https://example.com/js')",
      ]) {
        const target = targetFromFacts(script(source))
        if (source.startsWith("app.launchURL('https"))
          // What follows the call is not looked at: PDF.js matches the start only.
          expect(target).toEqual(url('https://example.com/js'))
        else expect(target).toEqual(unsupported('unknown'))
      }
      expect(targetFromFacts(action({ kind: 'JavaScript' }))).toEqual(
        unsupported('unknown')
      )
    } finally {
      delete (globalThis as { __ran?: () => void }).__ran
    }
    expect(ran).toBe(false)
  })

  it('reads a megabyte script in linear time', () => {
    // A backtracking pattern would take minutes on these; the bound only leaves room for a
    // loaded machine.
    const long = `app.launchURL('${'a'.repeat(1_000_000)}`
    const nested = `${'window.open('.repeat(100_000)}`
    const spaces = `${' '.repeat(1_000_000)}x`
    const start = performance.now()
    for (const source of [long, nested, spaces])
      expect(targetFromFacts(script(source))).toEqual(unsupported('unknown'))
    expect(performance.now() - start).toBeLessThan(10_000)
  })

  it('any other action kind is unknown', () => {
    for (const kind of ['SubmitForm', 'ResetForm', 'Hide', 'Sound', ''])
      expect(targetFromFacts(action({ kind }))).toEqual(unsupported('unknown'))
  })

  it('with no action, the destination: dest', () => {
    expect(
      targetFromFacts({
        destination: { page: 0, fit: 'Fit', args: [null, null, null, null] },
      })
    ).toEqual({ kind: 'dest', raw: [0, { name: 'Fit' }] })
  })

  it('an action wins over a destination, even one that goes nowhere', () => {
    const destination = { page: 0, fit: 'Fit', args: [null, null, null, null] }
    expect(targetFromFacts({ ...uri('https://example.com/a'), destination })).toEqual(
      url('https://example.com/a')
    )
    expect(
      targetFromFacts({ action: { kind: 'Named', name: 'Print' }, destination })
    ).toEqual(unsupported('unknown'))
  })

  it('with neither, the additional action, by the same rules', () => {
    expect(
      targetFromFacts({
        additionalAction: { kind: 'URI', uri: ascii('https://example.com/aa') },
      })
    ).toEqual(url('https://example.com/aa'))
    expect(
      targetFromFacts({
        additionalAction: { kind: 'URI', uri: ascii('javascript:alert(1)') },
      })
    ).toEqual(unsupported('unsafe-url'))
    expect(
      targetFromFacts({
        additionalAction: { kind: 'Named', name: 'LastPage' },
      })
    ).toEqual({ kind: 'named', action: 'LastPage' })
    // Not when there is a destination or an action.
    expect(
      targetFromFacts({
        destination: { name: ascii('a') },
        additionalAction: { kind: 'Named', name: 'LastPage' },
      })
    ).toEqual({ kind: 'dest', raw: 'a' })
    expect(
      targetFromFacts({
        action: { kind: 'Named', name: 'NextPage' },
        additionalAction: { kind: 'Named', name: 'LastPage' },
      })
    ).toEqual({ kind: 'named', action: 'NextPage' })
  })

  it('an empty destination name goes nowhere, as PDF.js tests the value before decoding it', () => {
    const empty = { name: new Uint8Array() }
    expect(targetFromFacts({ destination: empty })).toEqual(unsupported('unknown'))
    expect(targetFromFacts(action({ kind: 'GoTo', destination: empty }))).toEqual(
      unsupported('unknown')
    )
    // A GoToR with an empty destination gets no #, so it is launch, not remote.
    expect(
      targetFromFacts(
        action({ kind: 'GoToR', file: ascii('other.pdf'), destination: empty })
      )
    ).toEqual(unsupported('launch'))
    // Bytes that decode to nothing are still a value: PDF.js keeps the empty name.
    expect(
      targetFromFacts({ destination: { name: new Uint8Array([0xfe, 0xff]) } })
    ).toEqual({ kind: 'dest', raw: '' })
  })

  it('nothing: unknown', () => {
    expect(targetFromFacts({})).toEqual(unsupported('unknown'))
  })
})

describe('rawDestination', () => {
  it('an explicit destination: [page, { name: fit }, ...] with the arguments its fit takes', () => {
    const args = [1, 2, 3, 4]
    expect(rawDestination({ page: 1, fit: 'XYZ', args })).toEqual([
      1,
      { name: 'XYZ' },
      1,
      2,
      3,
    ])
    for (const fit of ['FitH', 'FitBH', 'FitV', 'FitBV'])
      expect(rawDestination({ page: 1, fit, args })).toEqual([1, { name: fit }, 1])
    for (const fit of ['Fit', 'FitB'])
      expect(rawDestination({ page: 1, fit, args })).toEqual([1, { name: fit }])
    expect(rawDestination({ page: 1, fit: 'FitR', args })).toEqual([
      1,
      { name: 'FitR' },
      1,
      2,
      3,
      4,
    ])
  })

  it('a page of -1 is passed on', () => {
    expect(
      rawDestination({ page: -1, fit: 'Fit', args: [null, null, null, null] })
    ).toEqual([-1, { name: 'Fit' }])
  })

  it('none for a fit PDF.js does not know, or a FitR missing a corner', () => {
    expect(
      rawDestination({ page: 0, fit: 'Unknown', args: [null, null, null, null] })
    ).toBe(undefined)
    expect(
      rawDestination({ page: 0, fit: 'FitR', args: [1, 2, 3, null] })
    ).toBeUndefined()
  })

  it('a name, decoded as PDF.js decodes a byte string', () => {
    expect(rawDestination({ name: ascii('chapter-2') })).toBe('chapter-2')
    // UTF-16BE and UTF-16LE with a byte-order mark; an odd last byte is dropped.
    expect(rawDestination({ name: new Uint8Array([0xfe, 0xff, 0x00, 0xe9, 0x00]) })).toBe(
      'é'
    )
    expect(rawDestination({ name: new Uint8Array([0xff, 0xfe, 0xe9, 0x00]) })).toBe('é')
    // UTF-8 with a byte-order mark.
    expect(rawDestination({ name: new Uint8Array([0xef, 0xbb, 0xbf, 0xc3, 0xa9]) })).toBe(
      'é'
    )
    // Else PDFDocEncoding: 0x80 is a bullet, 0x18 a breve, 0xe9 é.
    expect(rawDestination({ name: new Uint8Array([0x80, 0x18, 0xe9]) })).toBe('•˘é')
    // A byte-order mark before bytes that do not decode falls back to PDFDocEncoding.
    // For UTF-16 that is over the bytes left after the odd last one is dropped: here a lone
    // high surrogate, D800, with 0x41 after it.
    expect(rawDestination({ name: new Uint8Array([0xfe, 0xff, 0xd8, 0x00, 0x41]) })).toBe(
      'þÿØ\u0000'
    )
    expect(rawDestination({ name: new Uint8Array([0xff, 0xfe, 0x00, 0xdc, 0x41]) })).toBe(
      'ÿþ\u0000Ü'
    )
    expect(rawDestination({ name: new Uint8Array([0xef, 0xbb, 0xbf, 0xff]) })).toBe(
      'ï»¿ÿ'
    )
  })
})

describe('nameBytes', () => {
  it('gives bytes that decode to the name again', () => {
    for (const name of ['chapter-2', 'é', '•˘é', 'ünïcødé', '章', 'a\u{1F600}b', ''])
      expect(rawDestination({ name: nameBytes(name) })).toBe(name)
  })

  it('PDFDocEncoding when every character has a byte there, else UTF-16BE', () => {
    expect([...nameBytes('a•é')]).toEqual([0x61, 0x80, 0xe9])
    expect([...nameBytes('章')]).toEqual([0xfe, 0xff, 0x7a, 0xe0])
  })

  it('UTF-16BE for a name whose PDFDocEncoding bytes would read as a byte-order mark', () => {
    for (const name of ['þÿx', 'ÿþx', 'ï»¿x']) {
      expect([...nameBytes(name)].slice(0, 2)).toEqual([0xfe, 0xff])
      expect(rawDestination({ name: nameBytes(name) })).toBe(name)
    }
  })
})
