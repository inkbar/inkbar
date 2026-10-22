<script setup lang="ts">
import { ref } from 'vue'

import { useForm } from '../../src/composables/useForm'

import type { FieldValues } from '@inkbar/core'

const props = defineProps<{ setTo?: FieldValues | undefined }>()
const { fields, values, set, reset } = useForm()
const result = ref('')

function onSet(): void {
  const r = set(props.setTo ?? { name: 'Set' })
  result.value = r ? JSON.stringify(r) : ''
}
</script>

<template>
  <output
    data-testid="form"
    :data-fields="fields.length"
    :data-values="JSON.stringify(values)"
    :data-result="result"
  />
  <button type="button" data-testid="form-set" @click="onSet">set</button>
  <button type="button" data-testid="form-reset" @click="reset()">reset</button>
</template>
