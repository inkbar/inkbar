/** The front ends the smoke page runs through, one per page load. */
export const FRONTS = ['vanilla', 'vue', 'react', 'svelte'] as const
export type FrontId = (typeof FRONTS)[number]
