<script setup lang="ts">
// Miniature phone that acts out the Add to Home Screen steps, frame by frame (decorative:
// the numbered list next to it carries the same steps as text).
//   iOS:     Safari toolbar → share sheet → "Add to Home Screen" confirm → home screen
//   Android: Chrome ⋮ menu  → menu         → install dialog              → home screen
withDefaults(defineProps<{ platform?: 'ios' | 'android'; step?: number; appName?: string; iconSrc: string }>(), {
  platform: 'ios',
  step: 0,
  appName: 'Operators',
})

const host = typeof location === 'undefined' ? '' : location.host
// Muted placeholder tiles that fill the mock home screen before the real icon pops in.
const tiles = ['fill', 'blue', 'green', 'fill', 'orange', 'red', 'fill', 'blue', 'green']
</script>

<template>
  <div class="phone" aria-hidden="true">
    <div class="screen">
      <Transition name="frame" mode="out-in">
        <div :key="`${platform}-${step}`" class="frame">
          <!-- Step 4: home screen (both platforms) -->
          <div v-if="step === 3" class="home">
            <span v-for="(t, i) in tiles" :key="i" class="tile" :class="t" />
            <span class="app pop">
              <img :src="iconSrc" alt="" />
              <span>{{ appName }}</span>
            </span>
          </div>

          <!-- iOS 1: page + Safari toolbar -->
          <div v-else-if="platform === 'ios' && step === 0" class="col">
            <div class="page"><i class="h" /><i /><i class="w5" /><i /><i class="w4" /></div>
            <div class="toolbar">
              <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>
              <svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg>
              <span class="tap-target">
                <svg class="tint" viewBox="0 0 24 24"><path d="M12 3v12M7.5 7.5L12 3l4.5 4.5M8 10H6v10h12V10h-2" /></svg>
                <span class="ring" />
              </span>
              <svg viewBox="0 0 24 24"><path d="M4 6h6a2 2 0 0 1 2 2v11a2 2 0 0 0-2-2H4zM20 6h-6a2 2 0 0 0-2 2v11a2 2 0 0 1 2-2h6z" /></svg>
              <svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 5H6a2 2 0 0 0-2 2v9" /></svg>
            </div>
          </div>

          <!-- iOS 2: share sheet -->
          <div v-else-if="platform === 'ios' && step === 1" class="stack">
            <div class="col">
              <div class="page"><i class="h" /><i /><i class="w5" /></div>
              <div class="toolbar blank" />
            </div>
            <div class="scrim fade-in" />
            <div class="share-sheet sheet-in">
              <span class="grab" />
              <div class="act">
                <svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 5H6a2 2 0 0 0-2 2v9" /></svg>Copy
              </div>
              <div class="act">
                <svg viewBox="0 0 24 24"><path d="M4 6h6a2 2 0 0 1 2 2v11a2 2 0 0 0-2-2H4zM20 6h-6a2 2 0 0 0-2 2v11a2 2 0 0 1 2-2h6z" /></svg>Add to Reading List
              </div>
              <div class="act hl">
                <span class="tap-target">
                  <svg class="tint" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M12 8v8M8 12h8" /></svg>
                  <span class="ring" />
                </span>
                Add to Home Screen
              </div>
            </div>
          </div>

          <!-- iOS 3: Add to Home Screen confirmation -->
          <div v-else-if="platform === 'ios' && step === 2" class="col">
            <div class="confirm-bar">
              <span class="tint">Cancel</span>
              <b>Add to Home Screen</b>
              <span class="tap-target"><b class="tint">Add</b><span class="ring big" /></span>
            </div>
            <div class="confirm-card">
              <img :src="iconSrc" alt="" />
              <span class="field">{{ appName }}</span>
            </div>
          </div>

          <!-- Android 1: page + Chrome top bar with ⋮ -->
          <div v-else-if="platform === 'android' && step === 0" class="col">
            <div class="urlbar">
              <span class="url">{{ host }}</span>
              <span class="tap-target">
                <svg class="dots" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>
                <span class="ring" />
              </span>
            </div>
            <div class="page"><i class="h" /><i /><i class="w5" /><i /><i class="w4" /></div>
          </div>

          <!-- Android 2: overflow menu -->
          <div v-else-if="platform === 'android' && step === 1" class="stack">
            <div class="col">
              <div class="urlbar">
                <span class="url">{{ host }}</span>
                <svg class="dots" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>
              </div>
              <div class="page"><i class="h" /><i /></div>
            </div>
            <div class="menu pop-in">
              <span>New tab</span>
              <span>Bookmarks</span>
              <span class="hl">Add to Home screen<span class="tap-target dot"><span class="ring" /></span></span>
              <span>Settings</span>
            </div>
          </div>

          <!-- Android 3: install dialog -->
          <div v-else class="stack">
            <div class="col">
              <div class="urlbar"><span class="url">{{ host }}</span></div>
              <div class="page"><i class="h" /></div>
            </div>
            <div class="scrim dark fade-in" />
            <div class="dialog pop-in">
              <img :src="iconSrc" alt="" />
              <b>Install app</b>
              <span class="muted">{{ appName }}</span>
              <div class="dialog-actions">
                <span class="muted">Cancel</span>
                <span class="tap-target"><b class="tint">Install</b><span class="ring big" /></span>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.phone {
  flex: 0 0 auto;
  width: 150px;
  height: 280px;
  padding: 5px;
  border-radius: 26px;
  background: #1c1c1e;
  box-shadow: 0 0 0 1px var(--separator);
}
.screen {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 21px;
  background: var(--bg-grouped);
  color: var(--label);
  font-size: 9px;
  letter-spacing: 0;
  line-height: 1.2;
}
.frame,
.stack,
.col {
  position: absolute;
  inset: 0;
}
.col {
  display: flex;
  flex-direction: column;
}
svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: var(--label-2);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
svg.tint,
.tint {
  stroke: var(--tint);
  color: var(--tint);
}
svg.dots {
  fill: var(--label);
  stroke: none;
}
b {
  font-weight: 600;
}
.muted {
  color: var(--label-2);
}

/* Placeholder page content */
.page {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 8px;
}
.page i {
  height: 6px;
  border-radius: 3px;
  background: var(--fill-2);
}
.page i.h {
  width: 66%;
  height: 10px;
}
.page i.w5 {
  width: 83%;
}
.page i.w4 {
  width: 66%;
}

/* Safari bottom toolbar */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 26px;
  padding: 0 8px;
  border-top: 0.5px solid var(--separator);
  background: var(--material);
}

/* Pulsing "tap here" ring */
.tap-target {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.ring {
  position: absolute;
  inset: 0;
  width: 16px;
  height: 16px;
  margin: auto;
  border-radius: 50%;
  background: var(--tint);
  pointer-events: none;
  animation: tap-pulse 1.2s ease-out infinite;
}
.ring.big {
  width: 22px;
  height: 22px;
}
.tap-target.dot {
  width: 8px;
  height: 8px;
}
@keyframes tap-pulse {
  from { transform: scale(0.6); opacity: 0.55; }
  to { transform: scale(1.6); opacity: 0; }
}

/* iOS share sheet */
.scrim {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
}
.scrim.dark {
  background: rgba(0, 0, 0, 0.4);
}
.share-sheet {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  padding: 6px 8px 8px;
  border-radius: 10px 10px 0 0;
  background: var(--bg-cell);
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.25);
}
.grab {
  display: block;
  width: 24px;
  height: 4px;
  margin: 0 auto 6px;
  border-radius: 2px;
  background: var(--label-3);
}
.act {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 4px;
  border-radius: 6px;
}
.act svg {
  width: 12px;
  height: 12px;
}
.hl {
  background: color-mix(in srgb, var(--tint) 14%, transparent);
  color: var(--tint);
  font-weight: 500;
}

/* iOS confirm */
.confirm-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 6px 8px;
  border-bottom: 0.5px solid var(--separator);
  font-size: 8px;
}
.confirm-bar > b {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.confirm-card {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 8px 0;
  padding: 8px;
  border-radius: 10px;
  background: var(--bg-cell);
}
.confirm-card img {
  width: 28px;
  height: 28px;
  border-radius: 7px;
}
.field {
  flex: 1;
  min-width: 0;
  padding: 4px 6px;
  border: 0.5px solid var(--separator);
  border-radius: 6px;
  font-size: 8px;
}

/* Android Chrome */
.urlbar {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 6px 0 8px;
  border-bottom: 0.5px solid var(--separator);
  background: var(--material);
}
.url {
  flex: 1;
  min-width: 0;
  padding: 3px 8px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--fill);
  color: var(--label-2);
  font-size: 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.menu {
  position: absolute;
  top: 24px;
  right: 6px;
  display: flex;
  flex-direction: column;
  width: 100px;
  padding: 4px 0;
  border-radius: 8px;
  background: var(--bg-elevated);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
  font-size: 8px;
  transform-origin: top right;
}
.menu > span {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 8px;
}
.dialog {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  width: 112px;
  margin: -50px 0 0 -56px;
  padding: 10px;
  border-radius: 10px;
  background: var(--bg-elevated);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  font-size: 8px;
}
.dialog img {
  width: 24px;
  height: 24px;
  border-radius: 7px;
}
.dialog-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  align-self: stretch;
  margin-top: 6px;
}

/* Home screen */
.home {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  justify-items: center;
  gap: 9px 6px;
  padding: 12px 8px;
}
.tile {
  width: 24px;
  height: 24px;
  border-radius: 7px;
  background: var(--fill-2);
}
.tile.blue { background: color-mix(in srgb, var(--ios-blue) 25%, transparent); }
.tile.green { background: color-mix(in srgb, var(--ios-green) 25%, transparent); }
.tile.orange { background: color-mix(in srgb, var(--ios-orange) 25%, transparent); }
.tile.red { background: color-mix(in srgb, var(--ios-red) 25%, transparent); }
.app {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}
.app img {
  width: 24px;
  height: 24px;
  border-radius: 7px;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--tint) 60%, transparent);
}
.app span {
  max-width: 32px;
  overflow: hidden;
  font-size: 7px;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Entrances */
.fade-in {
  animation: fade 0.25s ease-out both;
}
.sheet-in {
  animation: slide-up 0.32s var(--ease-ios) both;
}
.pop-in {
  animation: pop-in 0.22s ease-out both;
}
.pop {
  animation: icon-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s both;
}
@keyframes fade {
  from { opacity: 0; }
}
@keyframes slide-up {
  from { transform: translateY(100%); }
}
@keyframes pop-in {
  from { transform: scale(0.85); opacity: 0; }
}
@keyframes icon-pop {
  0% { transform: scale(0); opacity: 0; }
  60% { transform: scale(1.15); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
.frame-enter-active,
.frame-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}
.frame-enter-from,
.frame-leave-to {
  opacity: 0;
  transform: scale(0.96);
}

/* The global Reduce Motion rule shortens animations; the pulsing ring would still flash. */
@media (prefers-reduced-motion: reduce) {
  .ring {
    display: none;
  }
}
</style>
