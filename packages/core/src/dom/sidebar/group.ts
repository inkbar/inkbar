/*
 * Sidebars that share a container (the parent of their roots) place themselves together: one
 * ResizeObserver per container measures it, and every change to a member, or to who is in the
 * group, places them all again with `placeSidebars`.
 */
import { placeSidebars, type SidebarPlacement, type SidebarSlot } from './placement'

/** A sidebar in a group: what it needs for placing, and where it is told to go. */
export interface SidebarGroupMember {
  slot(): SidebarSlot
  /** `first` is true on the member's first placement after the container was measured. */
  place(placement: SidebarPlacement, first: boolean): void
}

/** A member's hold on its group. */
export interface SidebarGroupMembership {
  /** The member's slot changed: place the group again. */
  changed(): void
  leave(): void
}

interface Group {
  /** The container's content width; undefined until it has one. */
  width: number | undefined
  /** Each member, and whether it has been placed yet. */
  members: Map<SidebarGroupMember, boolean>
  observer: ResizeObserver | undefined
  /** True while placing: a change from a member being placed runs another pass after. */
  busy: boolean
  again: boolean
}

const groups = new WeakMap<HTMLElement, Group>()

/** The parent's content width now, or undefined when it has none (detached, hidden, in node). */
function measure(parent: HTMLElement): number | undefined {
  try {
    if (!parent.isConnected) return undefined
    const style = getComputedStyle(parent)
    const width =
      parent.clientWidth -
      (parseFloat(style.paddingLeft) || 0) -
      (parseFloat(style.paddingRight) || 0)
    return width > 0 ? width : undefined
  } catch {
    return undefined
  }
}

/** A pass can only repeat when placing closes a panel, so a few always settle it. */
const MAX_PASSES = 4

function place(group: Group): void {
  if (group.busy) {
    group.again = true
    return
  }
  group.busy = true
  try {
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      group.again = false
      const width = group.width
      if (width === undefined) return
      const members = [...group.members.keys()]
      const slots = members.map((m) => m.slot())
      const placements = placeSidebars(width, slots)
      members.forEach((member, i) => {
        // Left the group while an earlier member was being placed.
        if (!group.members.has(member)) return
        const placement = placements.get(slots[i]!.key)
        if (!placement) return
        const first = !group.members.get(member)
        group.members.set(member, true)
        member.place(placement, first)
      })
      if (!group.again) return
    }
  } finally {
    group.busy = false
  }
}

/**
 * Joins `member` to the sidebars in `parent`, creating the group, and its observer, for the
 * first. The last to leave disconnects it.
 */
export function joinSidebarGroup(
  parent: HTMLElement,
  member: SidebarGroupMember
): SidebarGroupMembership {
  let group = groups.get(parent)
  if (!group) {
    const created: Group = {
      width: measure(parent),
      members: new Map(),
      observer: undefined,
      busy: false,
      again: false,
    }
    if (typeof ResizeObserver !== 'undefined') {
      created.observer = new ResizeObserver((entries) => {
        const measured = entries[entries.length - 1]?.contentRect.width
        // A hidden container measures 0: keep the last placement rather than float everything.
        if (measured === undefined || measured <= 0 || measured === created.width) return
        created.width = measured
        place(created)
      })
      created.observer.observe(parent)
    }
    groups.set(parent, created)
    group = created
  }
  const joined = group
  joined.members.set(member, false)
  place(joined)
  let left = false
  return {
    changed: () => {
      if (!left) place(joined)
    },
    leave: () => {
      if (left) return
      left = true
      joined.members.delete(member)
      if (joined.members.size === 0) {
        joined.observer?.disconnect()
        groups.delete(parent)
      } else place(joined)
    },
  }
}
