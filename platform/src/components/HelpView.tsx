import { useState } from 'react'
import { renderMarkdown } from '../lib/markdown'

// 案内所（指示書⑦-4）: 静的ドキュメント。交流ではなくリファレンス。
// 記事は src/content/help/*.md（ビルド時に取り込み。ログイン不要で読める）。

const articles = import.meta.glob('../content/help/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const TOC: Array<{ file: string; title: string }> = [
  { file: '01-hajimete', title: 'はじめての方へ' },
  { file: '02-dougu', title: '道具の作り方' },
  { file: '05-ai', title: 'AIの使い方' },
  { file: '03-faq', title: 'よくある質問' },
  { file: '04-kenri', title: '権利について' },
]

function articleSource(file: string): string {
  const key = Object.keys(articles).find((path) => path.includes(file))
  return key ? articles[key] : '記事が見つかりません'
}

export function HelpView({ initialArticle }: { initialArticle?: string }) {
  const [current, setCurrent] = useState(
    initialArticle && TOC.some((t) => t.file === initialArticle) ? initialArticle : TOC[0].file,
  )

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 sm:flex-row">
      <nav className="nb-panel h-fit shrink-0 p-3 text-sm sm:w-48">
        <p className="mb-2 text-xs font-semibold text-stone-500">案内所</p>
        {TOC.map((item) => (
          <button
            key={item.file}
            type="button"
            onClick={() => setCurrent(item.file)}
            className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${
              current === item.file ? 'btn-primary' : 'hover:bg-stone-100'
            }`}
          >
            {item.title}
          </button>
        ))}
      </nav>
      <article
        className="nb-panel help-article min-w-0 flex-1 p-6 text-sm leading-relaxed"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(articleSource(current)) }}
      />
    </div>
  )
}
