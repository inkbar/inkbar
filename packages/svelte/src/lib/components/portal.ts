import type { Attachment } from 'svelte/attachments'

const attachments = new WeakMap<Element, Attachment<HTMLElement>>()

/**
 * Teleport for an element's content. On attach it moves every child node of the element into
 * `target`, Svelte's anchor comments included; on cleanup it moves them back so Svelte's own
 * teardown removes them. Svelte inserts later nodes relative to those anchors, so `{#if}` and
 * `{#each}` blocks inside the moved content keep updating in the target. The target ends up with
 * the content's own nodes and no wrapper, the same DOM the Vue and React packages produce.
 *
 * A new `target` is a new attachment: Svelte runs the cleanup and the attach again. The same
 * target always gets the same attachment, so `{@attach portal(el)}` re-evaluated with an
 * unchanged `el` leaves the content where it is.
 *
 * The cleanup relies on one invariant: the first and last nodes it moved are still children of
 * the target, in that order, and every node between them belongs to the wrapper (the nodes
 * moved on attach, plus whatever Svelte inserted between them since). Svelte keeps to it, because
 * it only ever inserts relative to the anchors that were moved. Then the whole run from the
 * first node to the last comes back, late nodes included. Nothing else may put nodes of its
 * own between the two: they would be taken for the wrapper's and moved into it.
 *
 * When the invariant does not hold (the first or last node has left the target, or the walk
 * from the first never reaches the last), the cleanup falls back to the nodes it moved on
 * attach, wherever they are now, and moves only those back. Nodes Svelte added later are not
 * moved.
 */
export function portal(target: Element): Attachment<HTMLElement> {
  let attachment = attachments.get(target)
  if (!attachment) {
    attachment = (wrapper) => {
      const moved = [...wrapper.childNodes]
      for (const node of moved) target.appendChild(node)
      return () => {
        const first = moved[0]
        const last = moved.at(-1)
        // Everything between the first and last moved node comes back, which takes in the
        // nodes Svelte inserted since. The target may already be detached (core removed the
        // annotation); the nodes move back all the same, so Svelte finds them where it left
        // them.
        const back: Node[] = []
        if (first && last && first.parentNode === target && last.parentNode === target) {
          for (let node: Node | null = first; node; node = node.nextSibling) {
            back.push(node)
            if (node === last) break
          }
        }
        for (const node of back.at(-1) === last ? back : moved)
          if (node.parentNode !== wrapper) wrapper.appendChild(node)
      }
    }
    attachments.set(target, attachment)
  }
  return attachment
}
