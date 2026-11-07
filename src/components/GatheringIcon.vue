<script setup lang="ts">
// Monogram app-icon for a gathering type (PM / WS / TG), in the gathering's colour.
defineProps<{ short: string; color: string; size?: number }>()
</script>

<template>
  <span
    class="g-icon"
    :style="{ '--g': color, '--s': `${size ?? 28}px` }"
    aria-hidden="true"
  >{{ short }}</span>
</template>

<style scoped>
.g-icon {
  flex: 0 0 auto;
  display: inline-grid;
  place-items: center;
  width: var(--s);
  height: var(--s);
  border-radius: calc(var(--s) * 0.24);
  /* light top-left sheen kept subtle (6% white) so the white monogram stays ≥4.5:1 */
  background: linear-gradient(160deg, color-mix(in srgb, var(--g) 94%, #fff) 0%, var(--g) 70%);
  box-shadow: inset 0 0 0 0.5px rgba(255, 255, 255, 0.25), 0 1px 2px rgba(0, 0, 0, 0.15);
  color: #fff;
  font-family: var(--font-display);
  font-size: calc(var(--s) * 0.4);
  font-weight: 800;
  letter-spacing: 0.02em;
  line-height: 1;
  text-transform: uppercase;
}
</style>
