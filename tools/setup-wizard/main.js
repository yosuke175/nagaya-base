// Setup wizard main process.
//
// Security notes:
// - The GitHub access token lives ONLY in this process's memory (never
//   written to disk, never embedded in the clone URL — the clone uses the
//   plain public https URL, so nothing secret lands in .git/config).
// - The renderer runs with contextIsolation and talks through preload.js.
'use strict'
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')
const { spawn, exec } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const config = require('./config.json')
const { runEnvChecks, validateGadgetId } = require('./checks')

let mainWindow = null
let accessToken = null // in-memory only
let pendingDevice = null
let devServer = null

function createWindow() {
  mainWindow = new BrowserWindow({
    // 一番内容が多い画面（GitHub連携・完成）でもスクロールなしで収まる高さにしておく。
    // リサイズ可（既定）。小さくし過ぎないよう最小サイズも指定。
    width: 900,
    height: 880,
    minWidth: 680,
    minHeight: 640,
    title: `${config.appName} セットアップ`,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  mainWindow.removeMenu()
  void mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => {
  if (devServer) {
    try {
      devServer.kill()
    } catch {}
  }
  app.quit()
})

const send = (channel, payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}
const log = (line) => send('wizard:log', line)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
// ターミナル出力の色コード（ANSI）を除去。これが付いたままだと URL 検出の正規表現が
// `localhost:` と番号の間で切れて一致せず、ブラウザが開かない原因になる。
// eslint-disable-next-line no-control-regex
const stripAnsi = (s) => s.replace(/\[[0-9;]*[A-Za-z]/g, '')

async function gh(method, apiPath, body) {
  const response = await fetch(`https://api.github.com${apiPath}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${accessToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok && response.status !== 202) {
    throw new Error(data.message ?? `GitHub API エラー (HTTP ${response.status})`)
  }
  return data
}

/** Runs a command with shell, streaming output lines to the renderer. */
function spawnLogged(command, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { cwd, shell: true, windowsHide: true })
    const onData = (buffer) => {
      for (const line of stripAnsi(buffer.toString()).split(/\r?\n/)) {
        if (line.trim()) log(line)
      }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`コマンドが失敗しました (exit ${code}): ${command}`))
    })
  })
}

// ---------------------------------------------------------------------------

ipcMain.handle('config:get', () => ({
  ...config,
  defaultParentDir: os.homedir(),
  platform: process.platform,
}))

ipcMain.handle('env:check', () => runEnvChecks())

ipcMain.handle('open:url', (_event, url) => {
  if (typeof url === 'string' && url.startsWith('https://')) {
    void shell.openExternal(url)
  }
})

// --- GitHub Device Flow ----------------------------------------------------

ipcMain.handle('auth:start', async () => {
  if (!config.githubClientId) {
    throw new Error(
      'config.json の githubClientId が未設定です。配布担当者向けの設定手順は tools/setup-wizard/README.md を参照してください',
    )
  }
  const response = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: config.githubClientId, scope: 'repo' }),
  })
  const data = await response.json()
  if (!response.ok || data.error) {
    throw new Error(data.error_description ?? `認証コードの取得に失敗しました (HTTP ${response.status})`)
  }
  pendingDevice = data
  return {
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    interval: data.interval ?? 5,
    expiresIn: data.expires_in,
  }
})

ipcMain.handle('auth:poll', async () => {
  if (!pendingDevice) throw new Error('認証が開始されていません')
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: config.githubClientId,
      device_code: pendingDevice.device_code,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  })
  const data = await response.json()
  if (data.access_token) {
    accessToken = data.access_token
    pendingDevice = null
    const user = await gh('GET', '/user')
    return { status: 'ok', login: user.login }
  }
  if (data.error === 'authorization_pending') return { status: 'pending' }
  if (data.error === 'slow_down') return { status: 'slow_down', interval: data.interval ?? 10 }
  throw new Error(data.error_description ?? data.error ?? '認証に失敗しました')
})

// --- Fork / clone / install -------------------------------------------------

async function getRepo(owner, repo) {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' },
  })
  return response.ok ? response.json() : null
}

ipcMain.handle('repo:fork', async () => {
  if (!accessToken) throw new Error('先に GitHub 連携（手順3）を完了してください')
  const { upstreamOwner, upstreamRepo } = config
  const me = await gh('GET', '/user')

  // Owner path: no fork needed — clone upstream directly.
  if (me.login.toLowerCase() === upstreamOwner.toLowerCase()) {
    const repo = await getRepo(upstreamOwner, upstreamRepo)
    if (!repo) throw new Error(`${upstreamOwner}/${upstreamRepo} が見つかりません`)
    log(`リポジトリ所有者としてログイン中です。Fork は不要なので本家を直接使います: ${repo.full_name}`)
    return { fullName: repo.full_name, cloneUrl: repo.clone_url, login: me.login, isOwner: true }
  }

  // Idempotent: if the fork already exists, reuse it instead of re-forking.
  const existing = await getRepo(me.login, upstreamRepo)
  if (existing && existing.fork) {
    log(`既存の Fork を使います: ${existing.full_name}`)
    return { fullName: existing.full_name, cloneUrl: existing.clone_url, login: me.login, isOwner: false }
  }

  log(`Fork を作成しています: ${upstreamOwner}/${upstreamRepo} → ${me.login}/${upstreamRepo}`)
  await gh('POST', `/repos/${upstreamOwner}/${upstreamRepo}/forks`)
  for (let attempt = 0; attempt < 30; attempt++) {
    const repo = await getRepo(me.login, upstreamRepo)
    if (repo) {
      log(`Fork 完了: ${repo.full_name}`)
      return { fullName: repo.full_name, cloneUrl: repo.clone_url, login: me.login, isOwner: false }
    }
    await sleep(2000)
  }
  throw new Error('Fork の完了を確認できませんでした（github.com で手動確認してください）')
})

ipcMain.handle('dir:choose', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '保存先フォルダを選択',
    defaultPath: os.homedir(),
    properties: ['openDirectory', 'createDirectory'],
  })
  return result.canceled ? null : result.filePaths[0]
})

function isRepoClone(dir) {
  return (
    fs.existsSync(path.join(dir, '.git')) &&
    fs.existsSync(path.join(dir, 'gadgets', '_template', 'manifest.json'))
  )
}

async function ensureUpstreamRemote(target) {
  // Idempotent: `git remote add` fails if it already exists, so check first.
  const remotes = await new Promise((resolve) => {
    exec('git remote', { cwd: target, windowsHide: true }, (error, stdout) =>
      resolve(error ? '' : String(stdout)),
    )
  })
  if (!/(^|\n)upstream(\r?\n|$)/.test(remotes)) {
    log('$ git remote add upstream（本家の更新を取り込めるように）')
    await spawnLogged(
      `git remote add upstream "https://github.com/${config.upstreamOwner}/${config.upstreamRepo}.git"`,
      target,
    )
  }
}

ipcMain.handle('setup:clone', async (_event, { parentDir, cloneUrl, isOwner }) => {
  const target = path.join(parentDir, config.upstreamRepo)
  // Owner clones upstream directly, so origin already points to it — no
  // separate "upstream" remote is needed.
  const setUpstream = async (dir) => {
    if (!isOwner) await ensureUpstreamRemote(dir)
  }

  if (fs.existsSync(target)) {
    // Idempotent re-run: reuse an existing valid clone; only reject a
    // non-repo folder that happens to share the name.
    if (!isRepoClone(target)) {
      throw new Error(
        `同名のフォルダが既にありますが、リポジトリではないようです: ${target}\n` +
          '別の保存先を選ぶか、このフォルダを移動してから再実行してください。',
      )
    }
    log(`既存の clone を再利用します: ${target}`)
    await setUpstream(target)
    if (fs.existsSync(path.join(target, 'node_modules'))) {
      log('✅ 既に clone と npm install が済んでいます（スキップしました）')
    } else {
      log('$ npm install（数分かかります。そのままお待ちください）')
      await spawnLogged('npm install', target)
      log('✅ npm install が完了しました')
    }
    return { clonePath: target }
  }

  log(`$ git clone ${cloneUrl}`)
  await spawnLogged(`git clone "${cloneUrl}" "${target}"`, parentDir)
  await setUpstream(target)
  log('$ npm install（数分かかります。そのままお待ちください）')
  await spawnLogged('npm install', target)
  log('✅ clone と npm install が完了しました')
  return { clonePath: target }
})

ipcMain.handle('setup:validateExistingClone', (_event, dir) => {
  if (dir && fs.existsSync(path.join(dir, 'gadgets', '_template', 'manifest.json'))) {
    return { ok: true }
  }
  return {
    ok: false,
    reason: 'gadgets/_template が見つかりません。リポジトリのフォルダ（nagaya-base）を選んでください',
  }
})

// --- Gadget scaffold ----------------------------------------------------------

ipcMain.handle('gadget:validateId', (_event, { clonePath, id }) => {
  const result = validateGadgetId(id)
  if (!result.ok) return result
  if (clonePath && fs.existsSync(path.join(clonePath, 'gadgets', id))) {
    return { ok: false, reason: `gadgets/${id} は既に存在します` }
  }
  return { ok: true }
})

ipcMain.handle('gadget:create', async (_event, { clonePath, id, name }) => {
  const result = validateGadgetId(id)
  if (!result.ok) throw new Error(result.reason)
  const templateDir = path.join(clonePath, 'gadgets', '_template')
  const targetDir = path.join(clonePath, 'gadgets', id)
  if (!fs.existsSync(templateDir)) throw new Error('雛形 gadgets/_template が見つかりません')
  if (fs.existsSync(targetDir)) throw new Error(`gadgets/${id} は既に存在します`)
  fs.cpSync(templateDir, targetDir, { recursive: true })
  const manifestPath = path.join(targetDir, 'manifest.json')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  manifest.id = id
  if (name && name.trim()) manifest.name = name.trim()
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  log(`✅ gadgets/${id} を作成しました（manifest.json の id / name を書き換え済み）`)
  return { gadgetDir: `gadgets/${id}` }
})

// --- Dev server ----------------------------------------------------------------

ipcMain.handle('dev:run', (_event, { clonePath, id }) => {
  if (devServer) {
    try {
      devServer.kill()
    } catch {}
    devServer = null
  }
  log(`$ npm run dev:gadget ${id}`)
  devServer = spawn(`npm run dev:gadget ${id}`, { cwd: clonePath, shell: true, windowsHide: true })
  let opened = false
  const onData = (buffer) => {
    const text = stripAnsi(buffer.toString())
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) log(line)
    }
    const url = text.match(/https?:\/\/localhost:\d+/)
    if (url && !opened) {
      opened = true
      void shell.openExternal(url[0])
      send('wizard:dev-ready', url[0])
    }
  }
  devServer.stdout.on('data', onData)
  devServer.stderr.on('data', onData)
  devServer.on('exit', (code) => {
    send('wizard:dev-exit', code)
    devServer = null
  })
  return { started: true }
})
