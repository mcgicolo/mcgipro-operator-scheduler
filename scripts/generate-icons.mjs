// Generates every app icon from the SVG designs below.
//   node scripts/generate-icons.mjs
// Renders with Playwright's Chromium (already a dev dependency), so no image tools are needed.
//
// Outputs (all under public/, served from the Vite base path):
//   favicon.svg                      browsers that take SVG favicons (rounded tile)
//   favicon.ico                      16/32/48 px, simplified design for tab-sized rendering
//   icons/apple-touch-icon.png       180 px, full-bleed (iOS/iPadOS rounds the corners itself)
//   icons/icon-192.png, -512.png     PWA "any" icons: rounded tile, transparent corners
//   icons/icon-maskable-*.png        PWA maskable icons: full-bleed, artwork inside the safe zone
//   icons/icon-1024.png              full-bleed master for app stores / native wrappers
//   manifest.webmanifest             web app manifest (Android, Chrome/Edge install, Windows)
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pub = join(root, 'public')
const iconsDir = join(pub, 'icons')
mkdirSync(iconsDir, { recursive: true })

// Board colors (src/styles/tokens.css).
const C = {
  canvasTop: '#fafafb',
  canvasBottom: '#e9eaef',
  dot: 'rgba(26,26,31,0.07)',
  col: '#ffffff',
  colBorder: '#d3d6de',
  live: '#c62a2f',
  playback: '#2563eb',
  sticky: '#f5d128',
  stickyEdge: '#e0bb12',
  ink: '#1c1c1e',
  slot: '#b9bdc9',
}

// ---------------------------------------------------------------------------
// Full design, 1024 × 1024: two board columns (Live / Playback) with yellow name
// stickies, and one sticky being dragged into the empty Playback slot.
// ---------------------------------------------------------------------------
function sticky(x, y, { w = 250, h = 160, shadow = 'stickyShadow' } = {}) {
  return `
    <g filter="url(#${shadow})">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${C.sticky}"/>
      <rect x="${x}" y="${y + h - 14}" width="${w}" height="14" rx="7" fill="${C.stickyEdge}" opacity="0.55"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="none" stroke="${C.stickyEdge}" stroke-width="3" opacity="0.6"/>
    </g>
    <rect x="${x + 30}" y="${y + 42}" width="${w * 0.6}" height="24" rx="12" fill="${C.ink}" opacity="0.62"/>
    <rect x="${x + 30}" y="${y + 88}" width="${w * 0.38}" height="24" rx="12" fill="${C.ink}" opacity="0.28"/>`
}

function column(x, y, color, glyph, id) {
  const w = 330, h = 600, head = 100
  return `
    <clipPath id="clip-${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="46"/></clipPath>
    <g filter="url(#colShadow)">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="46" fill="${C.col}"/>
    </g>
    <g clip-path="url(#clip-${id})">
      <rect x="${x}" y="${y}" width="${w}" height="${head}" fill="${color}"/>
    </g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="46" fill="none" stroke="${C.colBorder}" stroke-width="5"/>
    ${glyph(x + 58, y + head / 2)}
    <rect x="${x + 96}" y="${y + head / 2 - 12}" width="140" height="24" rx="12" fill="#fff" opacity="0.92"/>`
}

const liveDot = (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="17" fill="#fff"/>`
const playTri = (cx, cy) =>
  `<path d="M ${cx - 13} ${cy - 18} L ${cx + 19} ${cy} L ${cx - 13} ${cy + 18} Z" fill="#fff" stroke="#fff" stroke-width="6" stroke-linejoin="round"/>`

function artwork() {
  const top = 212
  const L = 164, R = 530
  return `
    ${column(L, top, C.live, liveDot, 'l')}
    ${column(R, top, C.playback, playTri, 'r')}
    ${sticky(L + 40, top + 140)}
    ${sticky(L + 40, top + 324)}
    ${sticky(R + 40, top + 140)}
    <rect x="${R + 40}" y="${top + 324}" width="250" height="160" rx="16" fill="none"
          stroke="${C.slot}" stroke-width="6" stroke-dasharray="20 14"/>
    <g transform="rotate(7 ${R + 205} ${top + 446})">
      ${sticky(R + 80, top + 366, { shadow: 'liftShadow' })}
    </g>`
}

const defs = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.canvasTop}"/>
      <stop offset="1" stop-color="${C.canvasBottom}"/>
    </linearGradient>
    <pattern id="dots" width="64" height="64" patternUnits="userSpaceOnUse" x="0" y="0">
      <circle cx="32" cy="32" r="5" fill="${C.dot}"/>
    </pattern>
    <filter id="colShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#1a1a1f" flood-opacity="0.12"/>
    </filter>
    <filter id="stickyShadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#1a1a1f" flood-opacity="0.16"/>
    </filter>
    <filter id="liftShadow" x="-30%" y="-30%" width="160%" height="180%">
      <feDropShadow dx="0" dy="26" stdDeviation="22" flood-color="#1a1a1f" flood-opacity="0.3"/>
    </filter>
  </defs>`

/** @param {{rounded?: boolean, scale?: number}} o */
function fullSvg({ rounded = false, scale = 1 } = {}) {
  const shape = rounded
    ? `<rect width="1024" height="1024" rx="230" fill="url(#bg)"/><rect width="1024" height="1024" rx="230" fill="url(#dots)"/>`
    : `<rect width="1024" height="1024" fill="url(#bg)"/><rect width="1024" height="1024" fill="url(#dots)"/>`
  const art = scale === 1 ? artwork() : `<g transform="translate(512 512) scale(${scale}) translate(-512 -512)">${artwork()}</g>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${defs}${shape}${art}</svg>`
}

// ---------------------------------------------------------------------------
// Small design, 64 × 64, for 16–48 px: same composition, no text lines, shadows
// or dashes, so it stays crisp in a browser tab.
// ---------------------------------------------------------------------------
function smallSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <rect x="0.5" y="0.5" width="63" height="63" rx="14" fill="#f4f4f6" stroke="${C.colBorder}"/>
    <rect x="6" y="8" width="24" height="48" rx="5" fill="#fff" stroke="${C.colBorder}"/>
    <rect x="34" y="8" width="24" height="48" rx="5" fill="#fff" stroke="${C.colBorder}"/>
    <path d="M 6 13 a 5 5 0 0 1 5 -5 h 14 a 5 5 0 0 1 5 5 v 5 h -24 Z" fill="${C.live}"/>
    <path d="M 34 13 a 5 5 0 0 1 5 -5 h 14 a 5 5 0 0 1 5 5 v 5 h -24 Z" fill="${C.playback}"/>
    <rect x="9" y="22" width="18" height="12" rx="2.5" fill="${C.sticky}"/>
    <rect x="9" y="38" width="18" height="12" rx="2.5" fill="${C.sticky}"/>
    <rect x="37" y="22" width="18" height="12" rx="2.5" fill="${C.sticky}"/>
    <rect x="39" y="38" width="18" height="12" rx="2.5" fill="${C.sticky}" stroke="${C.stickyEdge}" transform="rotate(8 48 44)"/>
  </svg>`
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
const browser = await chromium.launch({ headless: false })
const page = await browser.newPage({ deviceScaleFactor: 1 })

// Draw the SVG onto a canvas of the exact size (independent of the browser window, which
// has a minimum size when headed) and read it back as PNG.
async function render(svg, size) {
  const dataUrl = await page.evaluate(
    async ({ svg, size }) => {
      const sized = svg.replace('<svg ', `<svg width="${size}" height="${size}" `)
      const img = new Image()
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sized)
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = size
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, size, size)
      return canvas.toDataURL('image/png')
    },
    { svg, size },
  )
  return Buffer.from(dataUrl.split(',')[1], 'base64')
}

/** ICO container holding PNG images (supported by every browser and Windows Vista+). */
function ico(pngs) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngs.length, 4)
  let offset = 6 + 16 * pngs.length
  const entries = pngs.map(({ size, data }) => {
    const e = Buffer.alloc(16)
    e.writeUInt8(size >= 256 ? 0 : size, 0)
    e.writeUInt8(size >= 256 ? 0 : size, 1)
    e.writeUInt8(0, 2)
    e.writeUInt8(0, 3)
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(data.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += data.length
    return e
  })
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)])
}

const write = (rel, data) => {
  writeFileSync(join(pub, rel), data)
  console.log('✓', rel)
}

const rounded = fullSvg({ rounded: true })
const bleed = fullSvg()
// Maskable safe zone is a circle of radius 40% of the icon; 0.8 keeps every corner of the artwork inside it.
const maskable = fullSvg({ scale: 0.8 })
const small = smallSvg()

write('favicon.svg', rounded)
write('favicon.ico', ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await render(small, size) })))))
write('icons/apple-touch-icon.png', await render(bleed, 180))
write('icons/icon-192.png', await render(rounded, 192))
write('icons/icon-512.png', await render(rounded, 512))
write('icons/icon-maskable-192.png', await render(maskable, 192))
write('icons/icon-maskable-512.png', await render(maskable, 512))
write('icons/icon-1024.png', await render(bleed, 1024))

await browser.close()

const manifest = {
  id: './',
  name: 'Operator Scheduling',
  short_name: 'Operators',
  description: 'Drag-and-drop scheduling board for live and playback operators.',
  start_url: './',
  scope: './',
  display: 'standalone',
  orientation: 'any',
  background_color: '#f2f2f7',
  theme_color: '#f2f2f7',
  icons: [
    { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}
write('manifest.webmanifest', JSON.stringify(manifest, null, 2) + '\n')
