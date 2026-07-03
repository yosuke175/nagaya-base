// Pure helpers (no Electron imports) so they can be unit-tested with vitest.
'use strict'
const { exec } = require('node:child_process')

// Gadget id rule from docs/gadget-spec.md §2
const GADGET_ID_PATTERN = /^[a-z0-9-]{3,40}$/

function validateGadgetId(id) {
  if (typeof id !== 'string' || id.length === 0) {
    return { ok: false, reason: 'ガジェットIDを入力してください' }
  }
  if (!GADGET_ID_PATTERN.test(id)) {
    return {
      ok: false,
      reason: '半角英小文字・数字・ハイフンのみ、3〜40文字で入力してください',
    }
  }
  return { ok: true }
}

function parseMajorVersion(text) {
  const match = String(text).match(/v?(\d+)\./)
  return match ? Number(match[1]) : null
}

function commandVersion(command) {
  return new Promise((resolve) => {
    exec(command, { timeout: 10_000, windowsHide: true }, (error, stdout) => {
      resolve(error ? null : String(stdout).trim())
    })
  })
}

const NODE_MIN_MAJOR = 20

async function runEnvChecks() {
  const [git, node] = await Promise.all([
    commandVersion('git --version'),
    commandVersion('node --version'),
  ])
  const nodeMajor = node ? parseMajorVersion(node) : null
  return [
    {
      id: 'git',
      label: 'Git',
      ok: git !== null,
      detail: git ?? '見つかりませんでした',
      downloadUrl: 'https://git-scm.com/downloads',
    },
    {
      id: 'node',
      label: `Node.js（v${NODE_MIN_MAJOR} 以上）`,
      ok: nodeMajor !== null && nodeMajor >= NODE_MIN_MAJOR,
      detail:
        node === null
          ? '見つかりませんでした'
          : nodeMajor >= NODE_MIN_MAJOR
            ? node
            : `${node}（v${NODE_MIN_MAJOR} 以上が必要です）`,
      downloadUrl: 'https://nodejs.org/ja/download',
    },
  ]
}

module.exports = { GADGET_ID_PATTERN, NODE_MIN_MAJOR, validateGadgetId, parseMajorVersion, runEnvChecks }
