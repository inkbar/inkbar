<script setup lang="ts">
/* Hands the page `window.__inkActivate`, which activates an annotation as the viewer does. */
import { useInkContext } from '../../src/context'

const ctx = useInkContext('ActivateHook')
window.__inkActivate = (id) => ctx.setActivated(id)
</script>

<template>
  <span hidden />
</template>
