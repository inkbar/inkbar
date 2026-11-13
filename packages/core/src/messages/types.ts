/** A label a host sets: text, or a function called each time the label is read. */
export type Label = string | (() => string)

/** A message that takes values: a template or a plural, built by `template` and `plural`. */
export type MessageFn<P> = (params: P) => string

type Page = { page: number }
type Total = { current: number; total: number }

/** Every string Inkbar shows, by group. Each group has a complete English default (`en`). */
export interface InkMessages {
  viewer: {
    document: string
    loading: string
    openFailed: string
    pageFailed: MessageFn<Page>
  }
  toolbar: {
    label: string
    find: string
    download: string
    print: string
    undo: string
    redo: string
    back: string
    forward: string
    zoomIn: string
    zoomOut: string
    zoom: string
    fitWidth: string
    fitPage: string
    zoomPercent: MessageFn<{ percent: number }>
    page: string
    pageOf: MessageFn<{ total: number }>
    previousPage: string
    nextPage: string
  }
  find: {
    field: string
    previous: string
    next: string
    matchCase: string
    close: string
    noResults: string
    count: MessageFn<Total>
    countScanning: MessageFn<Total>
    announce: MessageFn<Total & Page>
    announceScanning: MessageFn<Total & Page>
  }
  search: {
    field: string
    placeholder: string
    prompt: string
    noResults: string
    resultCount: MessageFn<{ count: number }>
    matchPage: MessageFn<Page>
    match: MessageFn<{ index: number }>
  }
  records: {
    empty: string
    itemCount: MessageFn<{ count: number }>
  }
  sidebar: {
    tab: MessageFn<{ label: string; badge: string }>
    resizeLeft: string
    resizeRight: string
  }
  outline: {
    label: string
    empty: string
  }
  thumbnails: {
    page: MessageFn<Page>
  }
  annotations: {
    highlight: string
    underline: string
    strikeout: string
    squiggly: string
    text: string
    freetext: string
    square: string
    circle: string
    line: string
    polyline: string
    polygon: string
    ink: string
    stamp: string
    loupe: string
    mask: string
    redact: string
    signature: string
    withComment: MessageFn<{ name: string }>
    byAuthor: MessageFn<{ name: string; author: string }>
  }
  links: {
    unsupported: string
    goToLink: string
    goToPage: MessageFn<Page>
  }
  tools: {
    'select-text': string
    select: string
    draw: string
    shape: string
    note: string
    highlight: string
    freetext: string
    sketch: string
    signature: string
    'redact-area': string
  }
  lineStyle: {
    label: string
    weight: string
    weightValue: MessageFn<{ points: number }>
    pattern: string
    solid: string
    dashed: string
    arrowheads: string
    arrowNone: string
    arrowStart: string
    arrowEnd: string
    arrowBoth: string
  }
  color: {
    border: string
    fill: string
    textColor: string
    noFill: string
    swatches: string
    custom: string
    customColour: string
  }
  textStyle: {
    label: string
    font: string
    fontSize: string
    bold: string
    italic: string
    underline: string
    alignment: string
    alignLeft: string
    alignCenter: string
    alignRight: string
    alignJustify: string
    size: string
    decrease: string
    increase: string
    emphasis: string
    mixed: string
  }
  highlight: {
    label: string
    choose: string
    menu: string
    kinds: string
    colour: string
    highlightColour: string
    highlight: string
    underline: string
    strikeout: string
    squiggly: string
  }
  shape: {
    label: string
    choose: string
    menu: string
    current: MessageFn<{ kind: string }>
    line: string
    arrow: string
    rectangle: string
    roundedRectangle: string
    ellipse: string
    bubble: string
    star: string
    polygon: string
    loupe: string
    mask: string
    ovalMask: string
  }
  notes: {
    noteThread: string
    commentThread: string
    anonymous: string
    close: string
    comment: string
    reply: string
    delete: string
    deleteHighlight: string
  }
  signature: {
    sign: string
    trigger: string
    menu: string
    saved: string
    create: string
    dialog: string
    tabs: string
    draw: string
    type: string
    image: string
    pad: string
    clear: string
    name: string
    namePlaceholder: string
    fonts: string
    file: string
    cancel: string
    save: string
    item: MessageFn<{ n: number }>
    remove: MessageFn<{ n: number }>
    imageTooLarge: string
    imageType: string
    storageFull: string
    saveFailed: string
    removeFailed: string
  }
  password: {
    dialog: string
    description: string
    field: string
    submit: string
    cancel: string
    incorrect: string
    locked: string
    unlock: string
  }
  forms: {
    unnamed: string
    sign: string
    signField: MessageFn<{ label: string }>
    alert: string
    ok: string
  }
  plugins: {
    commandFailed: string
  }
}

/** What a host passes: any group, any subset of its keys. */
export type InkMessagesInput = { [G in keyof InkMessages]?: Partial<InkMessages[G]> }
