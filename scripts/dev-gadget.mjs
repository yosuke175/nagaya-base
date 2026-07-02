#!/usr/bin/env node
// Starts the platform dev server with a specific gadget on the dashboard.
// Usage: npm run dev:gadget <gadget-dir>   e.g. npm run dev:gadget _template
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const gadgetDir = process.argv[2]

if (!gadgetDir) {
  console.error('使い方: npm run dev:gadget <ガジェットのディレクトリ名>')
  console.error('例:     npm run dev:gadget _template')
  process.exit(1)
}

if (!existsSync(path.join(repoRoot, 'gadgets', gadgetDir, 'manifest.json'))) {
  console.error(`gadgets/${gadgetDir}/manifest.json が見つかりません`)
  process.exit(1)
}

const child = spawn('npm', ['run', 'dev'], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, VITE_DEV_GADGET_ID: gadgetDir },
})
child.on('exit', (code) => process.exit(code ?? 0))
