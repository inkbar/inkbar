<script setup lang="ts">
// Adds a text box or a square and selects it, so the menu has something to style.
import { computed } from 'vue'

import { useAnnotations } from '../../src/composables/useAnnotations'
import { useSelection } from '../../src/composables/useSelection'
import { useTool } from '../../src/composables/useTool'
import { useToolStyle } from '../../src/composables/useToolStyle'

const { annotations, add } = useAnnotations()
const { select } = useSelection()
const { setTool } = useTool()
const style = useToolStyle()

const boxStyle = computed(() => {
  const box = annotations.value.find((a) => a.type === 'freetext')
  return box && box.type === 'freetext' ? JSON.stringify(box.defaultStyle) : ''
})
// `get` is not reactive; `current` changes whenever the group does.
const group = computed(() => {
  void style.current.value
  return JSON.stringify(style.get('text'))
})
</script>

<template>
  <div data-testid="probe" :data-style="boxStyle" :data-group="group">
    <button
      data-testid="add-box"
      @click="
        add({
          type: 'freetext',
          page: 0,
          rect: { x: 50, y: 500, width: 200, height: 40 },
          contents: 'Hello',
          defaultStyle: {
            fontFamily: 'Helvetica',
            fontSize: 12,
            color: '#000000',
            textAlign: 'left',
          },
        })
      "
    >
      box
    </button>
    <button
      data-testid="add-square"
      @click="
        add({ type: 'square', page: 0, rect: { x: 50, y: 400, width: 100, height: 60 } })
      "
    >
      square
    </button>
    <button data-testid="select-all" @click="select(annotations.map((a) => a.id))">
      select all
    </button>
    <button data-testid="select-none" @click="select([])">select none</button>
    <button data-testid="tool-select" @click="setTool('select')">select tool</button>
    <button data-testid="tool-freetext" @click="setTool('freetext')">text tool</button>
  </div>
</template>
