<script setup lang="ts">
defineProps<{ name: string; color: string; filled: number; total: number }>()
</script>

<template>
  <h2 class="group-header" :style="{ '--g': color }">
    <i aria-hidden="true" />
    <span class="title">{{ name }}</span>
    <span class="meta">{{ filled }} of {{ total }} covered</span>
  </h2>
</template>

<style scoped>
/* ---------- mobile (base): iOS grouped-section header ---------- */
.group-header {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  padding: 0 16px 7px;
  color: var(--label-2);
  font-size: 13px;
  font-weight: 400;
  line-height: 18px;
  letter-spacing: -0.005em;
  text-transform: uppercase;
}
i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--g);
}
.title {
  flex: 1;
}
.meta {
  text-transform: none;
}

/* ---------- desktop: Miro colored bar ---------- */
@media (min-width: 768px) {
  .group-header {
    justify-content: center;
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
  i,
  .meta {
    display: none;
  }
  .title {
    flex: none;
  }
}
</style>
