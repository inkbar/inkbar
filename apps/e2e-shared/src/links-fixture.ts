import type { ViewerAction } from '@inkbar/core'

declare global {
  interface Window {
    /** Every action the links page's viewer has reported, in order, for the tests to read. */
    __actions?: ViewerAction[]
  }
}

/** Whether `?doc=` names a fixture for the outline and links page of the review apps. */
export const isLinksFixture = (doc: string): boolean =>
  doc === 'outline' || doc === 'links'
