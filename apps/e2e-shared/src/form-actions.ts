import type { FormAction } from '@inkbar/core'

/** One line per form action, for the review apps' action list: its kind and its target. */
export function describeAction(a: FormAction): string {
  switch (a.kind) {
    case 'submit':
    case 'open-url':
      return `${a.kind} ${a.url}`
    case 'mail':
      return a.to ? `mail ${a.to}` : 'mail'
    case 'prompt':
      return `prompt ${a.message}`
    case 'print':
      return 'print'
  }
}

/** Whether `?doc=` names a form fixture, which the review apps open on their form page. */
export const isFormFixture = (doc: string): boolean => doc.startsWith('form-')
