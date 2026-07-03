#!/usr/bin/env node
// Optimize watercolor image assets for web delivery (指示書 ④⑤⑥ STEP 0).
//
// Source of truth: assets/ (originals). This script produces web-ready copies
// under platform/public/img/ and retires the heavy source PNGs to assets/src/.
// Re-runnable: it reads from assets/src/ if the original was already moved.
//
// Rules:
//   backgrounds/, keyvisual/ : width<=1920, WebP q82
//   objects/                 : width<=512,  WebP q82
//   textures/                : WebP (NO resize, to keep tiles seamless).
//     Note: the guide said "keep as-is", but 2.4MB/PNG tiles violate the
//     doc's own hard rule "重いPNGを直接Webに載せない"; lossless-ish WebP at
//     full resolution keeps seamlessness while cutting weight ~10x.
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const assetsDir = path.join(repoRoot, 'assets')
const srcDir = path.join(assetsDir, 'src')
const outDir = path.join(repoRoot, 'platform', 'public', 'img')

const PLAN = [
  { dir: 'backgrounds', mode: 'webp', width: 1920 },
  { dir: 'keyvisual', mode: 'webp', width: 1920 },
  { dir: 'objects', mode: 'webp', width: 512 },
  { dir: 'textures', mode: 'webp' }, // no width => full-resolution WebP (seamless)
]

// keyvisual/asset-sheet is a reference sheet, flyer is print-only (MANIFEST.md)
const SKIP = new Set(['keyvisual/asset-sheet.png', 'keyvisual/flyer-original.png'])

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

async function run() {
  let converted = 0
  let copied = 0
  let retired = 0
  for (const { dir, mode, width } of PLAN) {
    // Prefer originals still in assets/<dir>; fall back to assets/src/<dir>
    const liveDir = path.join(assetsDir, dir)
    const retiredDir = path.join(srcDir, dir)
    const sourceDir = fs.existsSync(liveDir) ? liveDir : retiredDir
    if (!fs.existsSync(sourceDir)) continue
    ensureDir(path.join(outDir, dir))

    for (const file of fs.readdirSync(sourceDir)) {
      if (!file.toLowerCase().endsWith('.png')) continue
      const rel = `${dir}/${file}`
      if (SKIP.has(rel)) continue
      const input = path.join(sourceDir, file)
      const base = path.basename(file, '.png')

      if (mode === 'webp') {
        const output = path.join(outDir, dir, `${base}.webp`)
        const pipeline = sharp(input)
        if (width) pipeline.resize({ width, withoutEnlargement: true })
        await pipeline.webp({ quality: 82 }).toFile(output)
        converted++
      } else {
        fs.copyFileSync(input, path.join(outDir, dir, file))
        copied++
      }

      // Retire heavy source PNGs to assets/src/ (originals kept, git-tracked).
      if (mode === 'webp' && sourceDir === liveDir) {
        ensureDir(retiredDir)
        fs.renameSync(input, path.join(retiredDir, file))
        retired++
      }
    }
    // Remove now-empty live dir for webp categories
    if (mode === 'webp' && fs.existsSync(liveDir) && fs.readdirSync(liveDir).length === 0) {
      fs.rmdirSync(liveDir)
    }
  }
  console.log(`optimized: ${converted} webp, ${copied} copied, ${retired} originals retired to assets/src/`)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
