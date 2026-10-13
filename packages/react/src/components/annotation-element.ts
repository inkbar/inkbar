import { observeAnnotationElement } from '@inkbar/core/dom'
import { useEffect, useState } from 'react'

/**
 * The overlay element core draws for an annotation, for anchoring a popover to it. Core
 * creates and removes these elements outside React, so this follows the root's subtree while
 * an id is wanted.
 */
export function useAnnotationElement(
  root: HTMLElement | null,
  id: string | null
): HTMLElement | null {
  const [element, setElement] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (!root || !id) {
      setElement(null)
      return
    }
    return observeAnnotationElement(root, id, setElement)
  }, [root, id])
  return element
}
