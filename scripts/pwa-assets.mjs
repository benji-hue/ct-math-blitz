/**
 * Рендерит иконки для PWA из assets/icon.svg в public/icons/.
 * Результат коммитится в репозиторий, поэтому CI ничего не генерирует.
 *
 *   node scripts/pwa-assets.mjs
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import sharp from 'sharp'

const SRC = 'assets/icon.svg'
const DIR = 'public/icons'
const BACKGROUND = '#070b18'

/** Маскируемая иконка: Android обрезает её в круг, поэтому нужны поля. */
const MASKABLE_SAFE_RATIO = 0.78

const svg = await readFile(SRC)
await mkdir(DIR, { recursive: true })

async function plain(size, name) {
  const buf = await sharp(svg)
    .resize(size, size, { fit: 'cover' })
    .flatten({ background: BACKGROUND })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer()
  await writeFile(`${DIR}/${name}`, buf)
  console.log(`  ✓ ${name} — ${size}×${size}`)
}

async function maskable(size, name) {
  const inner = Math.round(size * MASKABLE_SAFE_RATIO)
  const pad = Math.round((size - inner) / 2)
  const icon = await sharp(svg).resize(inner, inner, { fit: 'cover' }).png().toBuffer()
  const buf = await sharp({
    create: { width: size, height: size, channels: 3, background: BACKGROUND },
  })
    .composite([{ input: icon, top: pad, left: pad }])
    .png({ compressionLevel: 9 })
    .toBuffer()
  await writeFile(`${DIR}/${name}`, buf)
  console.log(`  ✓ ${name} — ${size}×${size} (maskable, поля ${pad}px)`)
}

// iOS берёт apple-touch-icon и сам скругляет углы — прозрачность ему вредна.
await plain(180, 'apple-touch-icon.png')
await plain(192, 'icon-192.png')
await plain(512, 'icon-512.png')
await maskable(512, 'icon-maskable-512.png')

console.log('Иконки PWA готовы.')
