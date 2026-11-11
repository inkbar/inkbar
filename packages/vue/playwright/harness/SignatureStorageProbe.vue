<script setup lang="ts">
/* Inside InkRoot: shows how many signatures the root's library holds and saves one more. */
import { injectInkContext } from '../../src/context'
import { useReadable } from '../../src/use-readable'

const ctx = injectInkContext()
const templates = useReadable(() => ctx.signatures.value.templates, [])

function save(): void {
  void ctx.signatures.value.save({
    id: 'added',
    kind: 'ink',
    inklist: [
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    ],
    aspect: 1,
  })
}
</script>

<template>
  <output data-testid="signatures">{{ templates.length }}</output>
  <button type="button" data-testid="save-signature" @click="save">Save signature</button>
</template>
