import { describe, expect, it } from 'vitest'

import { cleanUri, nameBytes, rawDestination, targetFromFacts } from './targets'
import { explicitDest } from './test-utils'

import type { FileActionShape, FileDestinationShape, FileTargetShape } from './types'

/** The bytes of ASCII text. */
const ascii = (text: string) => new TextEncoder().encode(text)

const action = (a: FileActionShape): FileTargetShape => ({ action: a })
const uri = (text: string) => action({ kind: 'URI', uriKind: 'string', uri: ascii(text) })
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
      targetFromFacts(
        action({ kind: 'URI', uriKind: 'string', uri: new Uint8Array([0xff, 0xfe]) })
      )
    ).toEqual(unsupported('launch'))
    expect(targetFromFacts(uri('www.example'))).toEqual(unsupported('launch'))
    expect(targetFromFacts(uri('page.html#top'))).toEqual(unsupported('remote'))
  })

  it('a URI written as a name is the address / and the name, as PDF.js reads it', () => {
    const named = (text: string) =>
      targetFromFacts(action({ kind: 'URI', uriKind: 'name', uri: ascii(text) }))
    // `/URI /https://example.com` would otherwise read as an address with a scheme.
    expect(named('https://example.com')).toEqual(unsupported('launch'))
    expect(named('page#top')).toEqual(unsupported('remote'))
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
          destination: explicitDest(2, 'XYZ', [72, 500]),
        })
      )
    ).toEqual({ kind: 'dest', raw: [2, { name: 'XYZ' }, 72, 500] })
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
          fileKind: 'string',
          file: ascii('https://example.com/doc.pdf'),
          newWindow: true,
        })
      )
    ).toEqual(url('https://example.com/doc.pdf', true))
    expect(
      targetFromFacts(
        action({
          kind: 'Launch',
          fileKind: 'string',
          file: ascii('https://example.com/run'),
        })
      )
    ).toEqual(url('https://example.com/run'))
    expect(
      targetFromFacts(
        action({
          kind: 'Launch',
          fileKind: 'string',
          file: ascii('www.example.com/run'),
          newWindow: false,
        })
      )
    ).toEqual(url('http://www.example.com/run'))
  })

  it('a GoToR action with a destination in another file: the destination joins the address', () => {
    expect(
      targetFromFacts(
        action({
          kind: 'GoToR',
          fileKind: 'string',
          file: ascii('https://example.com/doc.pdf#old'),
          destination: { name: ascii('ch1') },
        })
      )
    ).toEqual(url('https://example.com/doc.pdf#ch1'))
  })

  it('a GoToR or Launch action whose file is unsafe is unsafe-url', () => {
    expect(
      targetFromFacts(
        action({ kind: 'GoToR', fileKind: 'string', file: ascii('file:///etc/passwd') })
      )
    ).toEqual(unsupported('unsafe-url'))
    expect(
      targetFromFacts(
        action({ kind: 'Launch', fileKind: 'string', file: ascii('javascript:alert(1)') })
      )
    ).toEqual(unsupported('unsafe-url'))
    expect(
      targetFromFacts(
        action({
          kind: 'Launch',
          fileKind: 'string',
          file: new Uint8Array([0xc3, 0x28]),
          newWindow: true,
        })
      )
    ).toEqual(unsupported('launch'))
    // In a file specification, bytes 0xff 0xfe are an empty UTF-16LE name, which PDF.js reads
    // as no address at all.
    expect(
      targetFromFacts(
        action({ kind: 'GoToR', fileKind: 'spec', file: new Uint8Array([0xff, 0xfe]) })
      )
    ).toEqual(unsupported('unknown'))
  })

  it('a GoToR action to a file with a destination is remote', () => {
    expect(
      targetFromFacts(
        action({
          kind: 'GoToR',
          fileKind: 'string',
          file: ascii('other.pdf'),
          destination: { name: ascii('ch1') },
        })
      )
    ).toEqual(unsupported('remote'))
    expect(
      targetFromFacts(
        action({
          kind: 'GoToR',
          fileKind: 'string',
          file: ascii('other.pdf'),
          destination: explicitDest(0, 'Fit'),
        })
      )
    ).toEqual(unsupported('remote'))
  })

  it('a GoToR action to a file with no destination is launch, as PDF.js reports it', () => {
    // PDF.js joins a GoToR's file and destination as file#dest and tells remote from launch by
    // the #, so with no destination there is no # and it is launch.
    expect(
      targetFromFacts(
        action({ kind: 'GoToR', fileKind: 'string', file: ascii('other.pdf') })
      )
    ).toEqual(unsupported('launch'))
    // And with no file at all, PDF.js reads nothing from it.
    expect(targetFromFacts(action({ kind: 'GoToR' }))).toEqual(unsupported('unknown'))
  })

  it('a Launch action to a file is launch', () => {
    expect(
      targetFromFacts(
        action({ kind: 'Launch', fileKind: 'string', file: ascii('app.exe') })
      )
    ).toEqual(unsupported('launch'))
    expect(targetFromFacts(action({ kind: 'Launch' }))).toEqual(unsupported('unknown'))
  })

  it('a file specification is read as text, a plain /F string as its bytes', () => {
    const utf16 = new Uint8Array([
      0xfe,
      0xff,
      ...[...'https://example.com/u'].flatMap((c) => [0, c.charCodeAt(0)]),
    ])
    expect(
      targetFromFacts(action({ kind: 'Launch', fileKind: 'spec', file: utf16 }))
    ).toEqual(url('https://example.com/u'))
    // PDF.js keeps a string's bytes, so its byte-order mark is two characters of the address.
    expect(
      targetFromFacts(action({ kind: 'Launch', fileKind: 'string', file: utf16 }))
    ).toEqual(unsupported('launch'))
  })

  it('a file specification turns each backslash into a slash, as PDF.js does', () => {
    const named = (text: string) =>
      targetFromFacts(action({ kind: 'GoToR', fileKind: 'spec', file: ascii(text) }))
    expect(named('https:\\\\example.com\\a\\b.pdf')).toEqual(
      url('https://example.com/a/b.pdf')
    )
    expect(named('https:\\/\\/example.com/c.pdf')).toEqual(
      url('https://example.com/c.pdf')
    )
    // A plain string keeps them: the URL parser then reads them as slashes itself.
    expect(
      targetFromFacts(
        action({ kind: 'GoToR', fileKind: 'string', file: ascii('dir\\x.pdf#p') })
      )
    ).toEqual(unsupported('remote'))
  })

  it('a file specification with no string gives the address "", as PDF.js reads it', () => {
    const spec = { kind: 'GoToR', fileKind: 'spec' } as const
    expect(targetFromFacts(action(spec))).toEqual(unsupported('unknown'))
    // A destination in the other file still joins it: "#ch1".
    expect(
      targetFromFacts(action({ ...spec, destination: { name: ascii('ch1') } }))
    ).toEqual(unsupported('remote'))
    // An /F that is neither a string nor a file specification: PDF.js reads nothing.
    expect(
      targetFromFacts(action({ kind: 'GoToR', destination: { name: ascii('ch1') } }))
    ).toEqual(unsupported('unknown'))
  })

  it('a remote explicit destination is joined as JSON of the array PDF.js gives', () => {
    const remote = (destination: FileDestinationShape) =>
      targetFromFacts(
        action({
          kind: 'GoToR',
          fileKind: 'string',
          file: ascii('https://example.com/other.pdf'),
          destination,
        })
      )
    expect(remote(explicitDest(4, 'FitH', [500]))).toEqual(
      url('https://example.com/other.pdf#[4,{%22name%22:%22FitH%22},500]')
    )
    expect(
      remote(
        explicitDest(-1, 'Fit', [], {
          pageRef: { objectNumber: 7, generation: 0 },
          pageKind: 'other',
        })
      )
    ).toEqual(
      url(
        'https://example.com/other.pdf#[{%22num%22:7,%22gen%22:0},{%22name%22:%22Fit%22}]'
      )
    )
    // One PDF.js refuses adds nothing.
    expect(remote(explicitDest(4, 'XYZ', [1]))).toEqual(
      url('https://example.com/other.pdf')
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

  it('a script cut short is read by its start, as a whole one is', () => {
    const cut = (source: string) =>
      targetFromFacts(
        action({ kind: 'JavaScript', script: source, scriptTruncated: true })
      )
    expect(cut("app.launchURL('https://example.com/js', true); app.alert('")).toEqual(
      url('https://example.com/js', true)
    )
    // Cut inside the call, it matches nothing.
    expect(cut("app.launchURL('https://example.com/j")).toEqual(unsupported('unknown'))
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
        destination: explicitDest(0, 'Fit'),
      })
    ).toEqual({ kind: 'dest', raw: [0, { name: 'Fit' }] })
  })

  it('an action wins over a destination, even one that goes nowhere', () => {
    const destination = explicitDest(0, 'Fit')
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
        additionalAction: {
          kind: 'URI',
          uriKind: 'string',
          uri: ascii('https://example.com/aa'),
        },
      })
    ).toEqual(url('https://example.com/aa'))
    expect(
      targetFromFacts({
        additionalAction: {
          kind: 'URI',
          uriKind: 'string',
          uri: ascii('javascript:alert(1)'),
        },
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

  it('a /Dest that is no destination still keeps the additional action out', () => {
    // PDF.js takes /Dest whenever the dictionary has one, valid or not, and reads /AA only
    // when it has neither /A nor /Dest.
    const additionalAction = { kind: 'Named', name: 'LastPage' } as const
    expect(targetFromFacts({ destinationInvalid: true, additionalAction })).toEqual(
      unsupported('unknown')
    )
    // A /Dest array PDF.js refuses does the same.
    expect(
      targetFromFacts({ destination: explicitDest(0, 'XYZ'), additionalAction })
    ).toEqual(unsupported('unknown'))
    // /A still wins over both.
    expect(
      targetFromFacts({
        destinationInvalid: true,
        action: { kind: 'Named', name: 'NextPage' },
        additionalAction,
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
        action({
          kind: 'GoToR',
          fileKind: 'string',
          file: ascii('other.pdf'),
          destination: empty,
        })
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
  const ref = { objectNumber: 12, generation: 0 }
  const byRef = (fit: string, given: readonly (number | null)[] = []) =>
    explicitDest(3, fit, given, { pageRef: ref, pageKind: 'ref' })

  it('an explicit destination: the page number, { name: fit }, the arguments as written', () => {
    expect(rawDestination(explicitDest(1, 'XYZ', [1, 2, 3]))).toEqual([
      1,
      { name: 'XYZ' },
      1,
      2,
      3,
    ])
    // Two arguments are two, not three with a null: PDF.js gives the array as the file has it.
    expect(rawDestination(explicitDest(1, 'XYZ', [1, null]))).toEqual([
      1,
      { name: 'XYZ' },
      1,
      null,
    ])
    for (const fit of ['FitH', 'FitBH', 'FitV', 'FitBV']) {
      expect(rawDestination(explicitDest(1, fit, [1]))).toEqual([1, { name: fit }, 1])
      // No argument at all is allowed: it leaves the coordinate as it is.
      expect(rawDestination(explicitDest(1, fit))).toEqual([1, { name: fit }])
    }
    for (const fit of ['Fit', 'FitB'])
      expect(rawDestination(explicitDest(1, fit))).toEqual([1, { name: fit }])
    expect(rawDestination(explicitDest(1, 'FitR', [1, 2, 3, 4]))).toEqual([
      1,
      { name: 'FitR' },
      1,
      2,
      3,
      4,
    ])
  })

  it('a page reference as PDF.js gives it, { num, gen }, noted with its page', () => {
    const pages = new Map<string, number>()
    expect(rawDestination(byRef('XYZ', [72, 600, null]), pages)).toEqual([
      { num: 12, gen: 0 },
      { name: 'XYZ' },
      72,
      600,
      null,
    ])
    expect(pages.get('12 0')).toBe(3)
    const gen2 = explicitDest(-1, 'Fit', [], {
      pageRef: { objectNumber: 9, generation: 2 },
      pageKind: 'other',
    })
    // A reference to anything is a valid entry: PDF.js checks only that it is a reference.
    expect(rawDestination(gen2, pages)).toEqual([{ num: 9, gen: 2 }, { name: 'Fit' }])
    expect(pages.get('9 2')).toBe(-1)
  })

  it('a page of -1 is passed on', () => {
    expect(rawDestination(explicitDest(-1, 'Fit'))).toEqual([-1, { name: 'Fit' }])
  })

  // PDF.js's `isValidExplicitDest`, rule by rule.
  it('none for a page entry that is neither a reference nor a whole number', () => {
    for (const pageKind of ['other', 'missing'] as const)
      expect(rawDestination(explicitDest(-1, 'Fit', [], { pageKind }))).toBeUndefined()
  })

  it('none for a fit not written as a name', () => {
    for (const fitKind of ['string', 'other', 'missing'] as const)
      expect(rawDestination(explicitDest(0, 'Fit', [], { fitKind }))).toBeUndefined()
  })

  it('none for a fit PDF.js does not know', () => {
    expect(rawDestination(explicitDest(0, 'Unknown'))).toBeUndefined()
  })

  it('none, and no throw, for a fit named after a property every object has', () => {
    for (const fit of ['constructor', '__proto__', 'toString', 'hasOwnProperty'])
      expect(rawDestination(explicitDest(0, fit))).toBeUndefined()
  })

  it('none for a Fit or FitB with an argument, even a null', () => {
    for (const fit of ['Fit', 'FitB']) {
      expect(rawDestination(explicitDest(1, fit, [1]))).toBeUndefined()
      expect(rawDestination(explicitDest(1, fit, [null]))).toBeUndefined()
    }
  })

  it('none for a FitH, FitBH, FitV or FitBV with more than one argument', () => {
    for (const fit of ['FitH', 'FitBH', 'FitV', 'FitBV']) {
      expect(rawDestination(explicitDest(1, fit, [1, 2]))).toBeUndefined()
      expect(rawDestination(explicitDest(1, fit, [1, null]))).toBeUndefined()
    }
  })

  it('none for an XYZ with fewer than two arguments or more than three', () => {
    expect(rawDestination(explicitDest(1, 'XYZ', [72]))).toBeUndefined()
    expect(rawDestination(explicitDest(1, 'XYZ'))).toBeUndefined()
    expect(rawDestination(explicitDest(1, 'XYZ', [1, 2, 3, 4]))).toBeUndefined()
    expect(
      rawDestination(explicitDest(1, 'XYZ', [null, null, null, null]))
    ).toBeUndefined()
  })

  it('none for a FitR without four numbers: a null is refused there', () => {
    expect(rawDestination(explicitDest(1, 'FitR', [1, 2, 3]))).toBeUndefined()
    expect(rawDestination(explicitDest(1, 'FitR', [1, null, 3, 4]))).toBeUndefined()
    expect(rawDestination(explicitDest(1, 'FitR', [1, 2, 3, 4, 5]))).toBeUndefined()
  })

  it('none for an argument that is neither a number nor null', () => {
    const name = explicitDest(1, 'XYZ', [1, 2], { argKinds: ['number', 'other'] })
    expect(rawDestination(name)).toBeUndefined()
  })

  it('none for an argument written as a reference, even to a number', () => {
    expect(
      rawDestination(explicitDest(1, 'FitH', [500], { argIndirect: true }))
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
