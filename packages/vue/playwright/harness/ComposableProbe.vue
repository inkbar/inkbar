<script setup lang="ts">
import { useAnnotations } from '../../src/composables/useAnnotations'
import { useDocument } from '../../src/composables/useDocument'
import { useEmbedded } from '../../src/composables/useEmbedded'
import { useHistory } from '../../src/composables/useHistory'
import { usePage } from '../../src/composables/usePage'
import { useSelection } from '../../src/composables/useSelection'
import { useTool } from '../../src/composables/useTool'
import { useZoom } from '../../src/composables/useZoom'

const { isReady, pages } = useDocument()
const { annotations, add } = useAnnotations()
const { selection, select } = useSelection()
const { total } = useEmbedded()
const { canUndo, canRedo, undo, redo, batch } = useHistory()
const { count, current } = usePage()
const { tool, setTool } = useTool()
const { zoom } = useZoom()

function addNote() {
  add({ type: 'text', page: 0, rect: { x: 0, y: 0, width: 20, height: 20 } })
}

function addBatch(n: number) {
  batch(() => {
    for (let i = 0; i < n; i++) addNote()
  })
}
</script>

<template>
  <div
    data-testid="probe"
    :data-ready="isReady"
    :data-pages="pages.length"
    :data-count="count"
    :data-current="current"
    :data-annotations="annotations.length"
    :data-selection="selection.join(',')"
    :data-embedded="total"
    :data-can-undo="canUndo"
    :data-can-redo="canRedo"
    :data-tool="tool"
    :data-zoom="zoom"
  >
    <button data-testid="add" @click="addNote">add</button>
    <button data-testid="batch3" @click="addBatch(3)">batch3</button>
    <button data-testid="batch9" @click="addBatch(9)">batch9</button>
    <button data-testid="undo" @click="undo">undo</button>
    <button data-testid="redo" @click="redo">redo</button>
    <button data-testid="select" @click="select(annotations.map((a) => a.id))">
      select
    </button>
    <button data-testid="highlight" @click="setTool('highlight')">highlight</button>
  </div>
</template>
