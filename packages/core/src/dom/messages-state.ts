/*
 * The words a viewer shows and the locale it formats for, as one value its parts subscribe to.
 * `createViewer` and the engine each own one; every page layer and control that shows words
 * reads it and rewrites its own labels in place when it changes.
 */
import { en, resolveMessages, type InkMessages, type InkMessagesInput } from '../messages'
import { writable, type Readable, type Writable } from '../model/readable'

export interface MessageState {
  /** Every string, English where the host passed nothing. */
  messages: InkMessages
  /**
   * The locale for dates and the root's `lang`: the host's `locale`, else the `lang` of the
   * messages the host passed. Undefined (the browser's) when the host passed neither.
   */
  locale: string | undefined
}

export interface MessageStore extends Writable<MessageState> {
  /** English with `input` merged in, replacing what was passed before. */
  setMessages(input?: InkMessagesInput): void
  setLocale(locale?: string): void
}

/**
 * A message state starting from `input` and `locale`. Every `setMessages` and `setLocale` sets
 * a new state object, so subscribers re-run even for an equal input: a host whose label
 * functions read its own language calls either to have them read again.
 */
export function createMessageState(
  input?: InkMessagesInput,
  locale?: string
): MessageStore {
  let explicit = locale
  // The host's input only: English's own `lang` sets no locale.
  let given = langOf(input)
  const state = writable<MessageState>({
    messages: resolveMessages(input),
    locale: explicit ?? given,
  })
  return {
    ...state,
    setMessages(next) {
      given = langOf(next)
      state.set({ messages: resolveMessages(next), locale: explicit ?? given })
    },
    setLocale(next) {
      explicit = next
      // A new messages object with the same words: a binding's memo keyed on `messages` runs
      // again, so a label function reading the host's language follows a locale-only change.
      state.set({ messages: { ...state.get().messages }, locale: explicit ?? given })
    },
  }
}

function langOf(input: InkMessagesInput | undefined): string | undefined {
  return typeof input?.lang === 'string' ? input.lang : undefined
}

const FIXED: MessageState = { messages: en, locale: undefined }

/** English, never changing: for a layer or control made without a viewer's state. */
export const ENGLISH: Readable<MessageState> = {
  get: () => FIXED,
  subscribe: () => () => undefined,
}
