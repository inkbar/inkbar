<script setup lang="ts">
/*
 * Hands the page `window.__inkActivate`, which activates an annotation as the viewer does, and
 * `window.__inkApply`, which applies the marks from code.
 */
import { useInkContext } from '../../src/context'

const ctx = useInkContext('ActivateHook')
window.__inkActivate = (id) => ctx.setActivated(id)
window.__inkApply = () => ctx.applyRedactions()
</script>

<template>
  <span hidden />
</template>
