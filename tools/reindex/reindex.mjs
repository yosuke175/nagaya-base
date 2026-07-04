// 案内AI 段1 / RAG 索引スクリプト（手動運用: `npm run reindex`）。
// 長屋の .md をチャンク化 → OpenAI で埋め込み → Supabase doc_chunks に upsert。
// 必要な環境変数（リポジトリ直下 .env）:
//   PLATFORM_EMBEDDING_KEY     OpenAI 埋め込みキー（sk-...）
//   SUPABASE_URL               例 https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  doc_chunks への書き込み用（service_role）
//
// 対象は .md のみ（コード本体は入れない）。案内所記事(help)・docsの一部・
// 各ガジェットの SETUP/README。dev内部ログ(journal等)は除外。

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const EMBEDDING_MODEL = 'text-embedding-3-small'
const MAX_CHUNK_CHARS = 1000
const EMBED_BATCH = 64

// --- .env 読み込み（依存を増やさない簡易パーサ） ---------------------------
function loadEnv() {
  const path = join(REPO_ROOT, '.env')
  const env = { ...process.env }
  if (existsSync(path)) {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
  return env
}

// --- 対象 .md の収集 --------------------------------------------------------
const EXCLUDE = new Set([
  'docs/journal.md',
  'docs/phase0-checklist.md',
  'docs/backlog.md',
  'CLA.md',
  'CLAUDE.md',
  'assets/MANIFEST.md',
])

function walkMd(dir, out) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walkMd(full, out)
    else if (name.endsWith('.md')) out.push(full)
  }
}

function targetFiles() {
  const all = []
  walkMd(REPO_ROOT, all)
  return all
    .map((f) => relative(REPO_ROOT, f).replace(/\\/g, '/'))
    .filter((rel) => !EXCLUDE.has(rel))
    .filter((rel) => !rel.startsWith('platform/dist/'))
}

// --- チャンク分割（段落単位で ~1000字に貪欲にまとめる。H1をタイトルとして付与） ---
function chunkMarkdown(text) {
  const title = (text.match(/^#\s+(.+)$/m)?.[1] ?? '').trim()
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const chunks = []
  let buf = ''
  const flush = () => {
    if (buf.trim()) chunks.push((title ? `# ${title}\n` : '') + buf.trim())
    buf = ''
  }
  for (const p of paras) {
    if ((buf + '\n\n' + p).length > MAX_CHUNK_CHARS && buf) flush()
    buf = buf ? buf + '\n\n' + p : p
    if (buf.length >= MAX_CHUNK_CHARS) flush()
  }
  flush()
  return chunks
}

// --- OpenAI 埋め込み（バッチ） ---------------------------------------------
async function embedBatch(env, inputs) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.PLATFORM_EMBEDDING_KEY}` },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: inputs }),
  })
  if (!res.ok) throw new Error(`OpenAI embeddings error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.data.map((d) => d.embedding)
}

// --- Supabase REST（service_role） ------------------------------------------
function sbHeaders(env) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
  }
}

async function main() {
  const env = loadEnv()
  for (const key of ['PLATFORM_EMBEDDING_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (!env[key]) {
      console.error(`✗ .env に ${key} がありません。tools/reindex/README 参照。`)
      process.exit(1)
    }
  }

  const files = targetFiles()
  console.log(`対象 .md: ${files.length} 件`)

  // 収集 → チャンク化
  const rows = []
  for (const rel of files) {
    const text = readFileSync(join(REPO_ROOT, rel), 'utf8')
    const gadgetId = rel.startsWith('gadgets/') ? rel.split('/')[1] : null
    chunkMarkdown(text).forEach((content, i) =>
      rows.push({ source_path: rel, chunk_index: i, content, gadget_id: gadgetId, key_owner: 'platform' }),
    )
  }
  console.log(`チャンク総数: ${rows.length}`)

  // 埋め込み（バッチ）
  for (let i = 0; i < rows.length; i += EMBED_BATCH) {
    const batch = rows.slice(i, i + EMBED_BATCH)
    const vectors = await embedBatch(env, batch.map((r) => r.content))
    batch.forEach((r, j) => (r.embedding = `[${vectors[j].join(',')}]`))
    console.log(`  埋め込み ${Math.min(i + EMBED_BATCH, rows.length)}/${rows.length}`)
  }

  // 全消し → 一括投入（フル再索引）
  const del = await fetch(`${env.SUPABASE_URL}/rest/v1/doc_chunks?id=gt.0`, {
    method: 'DELETE',
    headers: { ...sbHeaders(env), prefer: 'return=minimal' },
  })
  if (!del.ok) throw new Error(`delete failed ${del.status}: ${await del.text()}`)

  for (let i = 0; i < rows.length; i += 200) {
    const ins = await fetch(`${env.SUPABASE_URL}/rest/v1/doc_chunks`, {
      method: 'POST',
      headers: { ...sbHeaders(env), prefer: 'return=minimal' },
      body: JSON.stringify(rows.slice(i, i + 200)),
    })
    if (!ins.ok) throw new Error(`insert failed ${ins.status}: ${await ins.text()}`)
  }

  console.log(`✓ 完了: ${rows.length} チャンクを索引しました。`)
}

main().catch((e) => {
  console.error('✗ 失敗:', e.message)
  process.exit(1)
})
