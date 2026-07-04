'use strict'
/* Renderer logic. All privileged operations go through window.wizard (preload). */

const state = {
  config: null,
  step: 1,
  login: null,
  cloneUrl: null,
  isOwner: false,
  parentDir: null,
  clonePath: null,
  gadgetId: null,
  authTimer: null,
  authOpened: null,
  theme: null, // 選択したお題カード { key, name, idea }
}

const $ = (selector) => document.querySelector(selector)
const show = (el) => el.removeAttribute('hidden')
const hide = (el) => el.setAttribute('hidden', '')

// 各画面の水彩背景（指示書④⑤⑥ STEP 5。renderer/img に同梱）
const STEP_BACKGROUNDS = {
  1: 'img/gate-street.webp', // 門をくぐる
  2: 'img/workshop-tools.webp', // 工房で道具を揃える
  3: 'img/workshop-lantern.webp',
  4: 'img/workshop-lantern.webp',
  5: 'img/desk-code.webp',
  6: 'img/marketplace.webp', // 賑わいへ
}

function goTo(step) {
  state.step = step
  document.body.style.backgroundImage = `url(${STEP_BACKGROUNDS[step]})`
  document.querySelectorAll('main .step').forEach((section) => {
    section.toggleAttribute('hidden', Number(section.dataset.step) !== step)
  })
  document.querySelectorAll('#steps-nav li').forEach((item) => {
    const n = Number(item.dataset.step)
    item.classList.toggle('active', n === step)
    item.classList.toggle('done', n < step)
  })
  if (step === 2) void runEnvCheck()
  if (step === 5 && !gadgetIdInput.value) {
    // 迷わせない: IDは自動命名で埋めておく（変更可）
    gadgetIdInput.value = 'my-first-gadget'
    gadgetIdInput.dispatchEvent(new Event('input'))
  }
  if (step === 6) prepareFinish()
}

function showError(step, error, extra) {
  const box = $(`#error-${step}`)
  if (!box) return
  const detail = extra ? `\n\n【ここまでの状態】\n${extra}` : ''
  box.textContent = `エラー: ${error.message ?? error}${detail}\n\n下の「手動で続行する場合」も参照してください。`
  show(box)
}
function clearError(step) {
  const box = $(`#error-${step}`)
  if (box) hide(box)
}

document.querySelectorAll('[data-next]').forEach((b) => b.addEventListener('click', () => goTo(state.step + 1)))
document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => goTo(state.step - 1)))

// ---- init -------------------------------------------------------------------

async function init() {
  state.config = await window.wizard.getConfig()
  const { appName, estimatedMinutes, upstreamOwner, upstreamRepo, defaultParentDir } = state.config
  document.title = `${appName} セットアップ`
  $('#app-title').textContent = `${appName} セットアップウィザード`
  $('#welcome-text').textContent =
    `${appName} は、勉強会メンバーが自作の「ガジェット」を持ち寄って組み合わせる、共同開発のプラットフォームです。` +
    'このウィザードは、ガジェット開発を始めるための準備を順番に案内します。'
  $('#estimated-minutes').textContent = String(estimatedMinutes)
  state.parentDir = defaultParentDir
  $('#parent-dir').textContent = defaultParentDir
  document.querySelectorAll('.repo-name').forEach((el) => (el.textContent = upstreamRepo))
  $('#manual-upstream-url').textContent = `https://github.com/${upstreamOwner}/${upstreamRepo}`
  goTo(1)
}

// ---- step 2: env check --------------------------------------------------------

async function runEnvCheck() {
  const list = $('#env-list')
  list.textContent = '診断中…'
  const results = await window.wizard.checkEnv()
  list.replaceChildren()
  for (const item of results) {
    const row = document.createElement('div')
    row.className = 'check-item'
    const mark = document.createElement('span')
    mark.className = `mark ${item.ok ? 'ok' : 'ng'}`
    mark.textContent = item.ok ? '✓' : '✗'
    const body = document.createElement('div')
    body.className = 'grow'
    body.innerHTML = `<div>${item.label}</div><div class="detail"></div>`
    body.querySelector('.detail').textContent = item.detail
    row.append(mark, body)
    if (!item.ok) {
      const dl = document.createElement('button')
      dl.textContent = 'ダウンロードページを開く'
      dl.addEventListener('click', () => window.wizard.openUrl(item.downloadUrl))
      row.append(dl)
    }
    list.append(row)
  }
  $('#env-next').disabled = !results.every((r) => r.ok)
}
$('#env-recheck').addEventListener('click', runEnvCheck)

// ---- step 3: GitHub device flow ------------------------------------------------

$('#gh-signup').addEventListener('click', () => window.wizard.openUrl('https://github.com/signup'))

$('#auth-start').addEventListener('click', async () => {
  clearError(3)
  try {
    const info = await window.wizard.authStart()
    state.authOpened = info.verificationUri
    $('#auth-user-code').textContent = info.userCode
    show($('#auth-code-panel'))
    void window.wizard.openUrl(info.verificationUri)
    pollAuth(info.interval)
  } catch (error) {
    showError(3, error, '認証は開始されていません。もう一度「GitHub と連携する」を押すとやり直せます。')
  }
})

function pollAuth(intervalSec) {
  clearTimeout(state.authTimer)
  state.authTimer = setTimeout(async () => {
    try {
      const result = await window.wizard.authPoll()
      if (result.status === 'ok') {
        state.login = result.login
        $('#auth-status').textContent = ''
        hide($('#auth-code-panel'))
        const done = $('#auth-done')
        done.textContent = `✓ 連携できました: ${result.login} さん`
        show(done)
        $('#auth-next').disabled = false
        return
      }
      pollAuth(result.status === 'slow_down' ? result.interval : intervalSec)
    } catch (error) {
      showError(3, error, '認証は完了していません。「GitHub と連携する」からやり直せます。')
    }
  }, intervalSec * 1000)
}

$('#auth-copy-code').addEventListener('click', () => {
  void navigator.clipboard.writeText($('#auth-user-code').textContent)
})
$('#auth-open-page').addEventListener('click', () => {
  if (state.authOpened) void window.wizard.openUrl(state.authOpened)
})

// ---- step 4: fork / clone / install ---------------------------------------------

$('#choose-dir').addEventListener('click', async () => {
  const dir = await window.wizard.chooseDir()
  if (dir) {
    state.parentDir = dir
    $('#parent-dir').textContent = dir
  }
})

window.wizard.onLog((line) => {
  for (const id of ['#setup-log', '#dev-log']) {
    const box = $(id)
    if (!box.hasAttribute('hidden')) {
      box.textContent += line + '\n'
      box.scrollTop = box.scrollHeight
    }
  }
})

$('#setup-run').addEventListener('click', async () => {
  clearError(4)
  const logBox = $('#setup-log')
  logBox.textContent = ''
  show(logBox)
  $('#setup-run').disabled = true
  try {
    const fork = await window.wizard.fork()
    state.cloneUrl = fork.cloneUrl
    state.isOwner = fork.isOwner
    const result = await window.wizard.clone({
      parentDir: state.parentDir,
      cloneUrl: fork.cloneUrl,
      isOwner: fork.isOwner,
    })
    state.clonePath = result.clonePath
    const done = $('#setup-done')
    done.textContent = `✓ 準備完了: ${result.clonePath}`
    show(done)
    $('#setup-next').disabled = false
  } catch (error) {
    showError(
      4,
      error,
      `Fork: ${state.cloneUrl ? '作成済み（' + state.cloneUrl + '）' : '未確認'}\n` +
        `clone 先: ${state.parentDir}\n` +
        'ログ（上の黒い枠）にどこまで進んだかが残っています。',
    )
  } finally {
    $('#setup-run').disabled = false
  }
})

$('#use-existing').addEventListener('click', async () => {
  clearError(4)
  const dir = await window.wizard.chooseDir()
  if (!dir) return
  const check = await window.wizard.validateExistingClone(dir)
  if (!check.ok) {
    showError(4, new Error(check.reason))
    return
  }
  state.clonePath = dir
  const done = $('#setup-done')
  done.textContent = `✓ 既存のフォルダを使います: ${dir}`
  show(done)
  $('#setup-next').disabled = false
})

// ---- step 5: create gadget ---------------------------------------------------------

const gadgetIdInput = $('#gadget-id')

// お題カード: 選ぶと表示名を提案し、完成画面のAI指示文に反映される
document.querySelectorAll('.theme-card').forEach((card) => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.theme-card').forEach((other) => other.classList.remove('selected'))
    card.classList.add('selected')
    state.theme = {
      key: card.dataset.theme,
      idea: card.dataset.idea,
      name: card.querySelector('.t-name').textContent,
    }
    const nameInput = $('#gadget-name')
    if (state.theme.key !== 'blank' && !nameInput.value.trim()) {
      nameInput.value = state.theme.name
    }
  })
})
gadgetIdInput.addEventListener('input', async () => {
  const id = gadgetIdInput.value.trim()
  const feedback = $('#gadget-id-feedback')
  if (!id) {
    feedback.textContent = ''
    $('#gadget-create').disabled = true
    return
  }
  const result = await window.wizard.validateGadgetId({ clonePath: state.clonePath, id })
  feedback.textContent = result.ok ? '✓ 使えるIDです' : `✗ ${result.reason}`
  feedback.style.color = result.ok ? '#166534' : '#b91c1c'
  $('#gadget-create').disabled = !result.ok
})

$('#gadget-create').addEventListener('click', async () => {
  clearError(5)
  const id = gadgetIdInput.value.trim()
  const name = $('#gadget-name').value.trim()
  try {
    const result = await window.wizard.createGadget({ clonePath: state.clonePath, id, name })
    state.gadgetId = id
    const done = $('#gadget-done')
    done.textContent = `✓ ${result.gadgetDir} を作成しました`
    show(done)
    $('#gadget-next').disabled = false
  } catch (error) {
    showError(5, error, `リポジトリ: ${state.clonePath ?? '未設定'}\nガジェットはまだ作成されていません。`)
  }
})

// ---- step 6: finish ------------------------------------------------------------------

function prepareFinish() {
  const id = state.gadgetId ?? '<あなたのID>'
  const idea = state.theme && state.theme.idea ? state.theme.idea : '（ここに作りたいものを書く）'
  $('#dev-cmd').textContent = `npm run dev:gadget ${id}`
  $('#ai-prompt').textContent =
    `docs/gadget-spec.md と gadgets/${id}/ の雛形を読んでください。\n` +
    'この雛形を、次のアイデアのガジェット（道具）に改造してください。\n\n' +
    `アイデア: ${idea}\n\n` +
    '制約: gadget-spec.md の仕様を厳守すること\n' +
    '- プラットフォームとの通信は gadget-sdk（postMessage API）のみ\n' +
    '- manifest.json で宣言した permissions 以外の SDK 機能は使わない\n' +
    '- 外部サービスと通信する場合は externalServices の宣言が必要'
}

$('#dev-run').addEventListener('click', async () => {
  clearError(6)
  const logBox = $('#dev-log')
  logBox.textContent = ''
  show(logBox)
  const status = $('#dev-status')
  status.textContent = '起動中…（初回は少し時間がかかります）'
  show(status)
  try {
    await window.wizard.runDev({ clonePath: state.clonePath, id: state.gadgetId })
  } catch (error) {
    showError(6, error, `ターミナルで ${state.clonePath} に移動し、手動で起動できます: npm run dev:gadget ${state.gadgetId}`)
  }
})

window.wizard.onDevReady((url) => {
  $('#dev-status').textContent = `✓ 起動しました: ${url}（ブラウザを開きました）`
})
window.wizard.onDevExit((code) => {
  if (code !== 0 && code !== null) {
    showError(6, new Error(`開発サーバが終了しました (exit ${code})`), 'ログ（黒い枠）を確認してください。')
  }
})

$('#copy-dev-cmd').addEventListener('click', () => {
  void navigator.clipboard.writeText($('#dev-cmd').textContent)
})
$('#copy-ai-prompt').addEventListener('click', () => {
  void navigator.clipboard.writeText($('#ai-prompt').textContent)
})

void init()
