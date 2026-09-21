/**
 * Renders the app icon and launch screen into the generated Capacitor iOS project.
 *
 * Capacitor ships placeholder PNGs inside Assets.xcassets. Instead of hardcoding
 * their file names (which change between Capacitor releases), we overwrite every
 * PNG already present, each at the exact size Xcode expects it to be.
 *
 *   node scripts/ios-assets.mjs                 # write into ios/App/App/Assets.xcassets
 *   node scripts/ios-assets.mjs --preview out   # render samples into ./out (no Xcode project needed)
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const BACKGROUND = '#070b18'
const ICON_SVG = 'assets/icon.svg'
const SPLASH_SVG = 'assets/splash.svg'
const XCASSETS = 'ios/App/App/Assets.xcassets'

/** Fallback sizes used when a set is empty or we are rendering a preview. */
const ICON_FALLBACK = [['AppIcon-512@2x.png', 1024]]
const SPLASH_FALLBACK = [
  ['splash-2732x2732.png', 2732],
  ['splash-2732x2732-1.png', 2732],
  ['splash-2732x2732-2.png', 2732],
]

async function render(svg, width, height, { opaque }) {
  let pipeline = sharp(svg).resize(width, height, { fit: 'cover' })
  if (opaque) pipeline = pipeline.flatten({ background: BACKGROUND }).removeAlpha()
  return pipeline.png({ compressionLevel: 9 }).toBuffer()
}

async function fillSet(dir, svgPath, { opaque, fallback, label }) {
  const svg = await readFile(svgPath)
  await mkdir(dir, { recursive: true })

  const existing = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith('.png')).sort()

  const targets = []
  if (existing.length > 0) {
    for (const name of existing) {
      const meta = await sharp(path.join(dir, name)).metadata()
      targets.push([name, meta.width ?? 0, meta.height ?? 0])
    }
  } else {
    for (const [name, size] of fallback) targets.push([name, size, size])
  }

  for (const [name, width, height] of targets) {
    if (!width || !height) {
      console.warn(`  ! ${name}: не удалось определить размер, пропускаю`)
      continue
    }
    await writeFile(path.join(dir, name), await render(svg, width, height, { opaque }))
    console.log(`  ✓ ${name} — ${width}×${height}`)
  }

  console.log(`${label}: обновлено ${targets.length} файл(ов)`)
}

const previewFlag = process.argv.indexOf('--preview')
const previewDir = previewFlag === -1 ? null : (process.argv[previewFlag + 1] ?? 'asset-preview')

if (previewDir) {
  console.log(`Предпросмотр в ${previewDir}/`)
  await fillSet(path.join(previewDir, 'AppIcon.appiconset'), ICON_SVG, {
    opaque: true,
    fallback: ICON_FALLBACK,
    label: 'Иконка',
  })
  await fillSet(path.join(previewDir, 'Splash.imageset'), SPLASH_SVG, {
    opaque: true,
    fallback: SPLASH_FALLBACK,
    label: 'Splash',
  })
} else {
  if (!existsSync(XCASSETS)) {
    console.error(`Не найден ${XCASSETS}. Сначала выполните: npx cap add ios`)
    process.exit(1)
  }
  await fillSet(path.join(XCASSETS, 'AppIcon.appiconset'), ICON_SVG, {
    // App icons must be fully opaque — iOS rejects an alpha channel.
    opaque: true,
    fallback: ICON_FALLBACK,
    label: 'Иконка',
  })
  await fillSet(path.join(XCASSETS, 'Splash.imageset'), SPLASH_SVG, {
    opaque: true,
    fallback: SPLASH_FALLBACK,
    label: 'Splash',
  })
}
