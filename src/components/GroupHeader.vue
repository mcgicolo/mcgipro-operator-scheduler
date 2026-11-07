<script setup lang="ts">
import GatheringIcon from './GatheringIcon.vue'
defineProps<{ name: string; short: string; color: string; filled: number; total: number }>()
</script>

<template>
  <h2 class="group-header" :style="{ '--g': color }">
    <GatheringIcon class="icon" :short="short" :color="color" :size="26" />
    <span class="title">{{ name }}</span>
    <span class="meta">{{ filled }} of {{ total }} covered</span>
  </h2>
</template>

<style scoped>
/* ---------- mobile (base): iOS grouped-section header ---------- */
.group-header {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0;
  padding: 0 16px 8px;
  color: var(--label-2);
  font-size: 13px;
  font-weight: 400;
  line-height: 18px;
  letter-spacing: -0.005em;
  text-transform: uppercase;
}
.title {
  flex: 1;
}
.meta {
  text-transform: none;
}

/* ---------- desktop: Miro colored bar ---------- */
@media (min-width: 768px) and (min-height: 540px) {
  .group-header {
    justify-content: center;
    gap: 8px;
    margin: 0 0 8px;
    padding: 9px 12px;
    border-radius: 8px;
    background: var(--g);
    color: #fff;
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-align: center;
  }
  .meta {
    display: none;
  }
  /* on the coloured bar: a slightly darker tile so the white monogram keeps 4.5:1 */
  .icon {
    background: rgba(0, 0, 0, 0.16);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35);
  }
  .title {
    flex: none;
  }
}
</style>
