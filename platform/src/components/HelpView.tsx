import { useState } from 'react'
import { renderMarkdown } from '../lib/markdown'
import { ProgressView } from './ProgressView'

// 案内所（指示書⑦-4）: 静的ドキュメント。交流ではなくリファレンス。
// 記事は src/content/help/*.md（ビルド時に取り込み。ログイン不要で読める）。
// 「長屋の歩み」だけは記事ではなく ProgressView を差し込む（file: 'progress'）。

const articles = import.meta.glob('../content/help/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

// 読む順: はじめに → 店子（使う）→ 職人（作る）→ 大家（管理）→ 共通。
const TOC: Array<{ file: string; title: string }> = [
  { file: 'progress', title: '長屋の歩み' },
  { file: '01-hajimete', title: 'はじめての方へ' },
  { file: '06-manabi', title: '学びの3段階' },
  // 店子（使う人）
  { file: '10-tenant-nyukyo', title: '入居する（はじめの一歩）' },
  { file: '11-tenant-sagasu', title: '道具を見つける（道具市）' },
  { file: '12-tenant-tsukau', title: '道具を使う（部屋・棚）' },
  { file: '13-tenant-joho', title: '長屋のおしらせ' },
  { file: '14-tenant-heya', title: '部屋の設定・退去' },
  // 職人（作る人）
  { file: '07-tsukuru-hajimete', title: 'はじめての道具づくり（手順）' },
  { file: '20-maker-kobo', title: '工房の使い方' },
  { file: '21-maker-cloud', title: 'クラウドで道具を作る' },
  { file: '22-maker-preview', title: '部屋で試運転（プレビュー）' },
  { file: '23-maker-koukai', title: '道具市に公開する（PR）' },
  { file: '24-maker-spec', title: '道具の仕様（やさしい版）' },
  { file: '02-dougu', title: '道具の作り方' },
  // 大家（管理者）
  { file: '30-admin-kanri', title: '大家の間（管理のきほん）' },
  { file: '31-admin-teishi', title: '道具の緊急停止' },
  { file: '32-admin-sakujo', title: '入居者アカウントの削除' },
  { file: '33-admin-toukou', title: '回覧板・長屋暦への投稿' },
  // 共通
  { file: '05-ai', title: 'AIの使い方' },
  { file: '03-faq', title: 'よくある質問' },
  { file: '04-kenri', title: '権利について' },
]

function articleSource(file: string): string {
  const key = Object.keys(articles).find((path) => path.includes(file))
  return key ? articles[key] : '記事が見つかりません'
}

export function HelpView({
  initialArticle,
  onOpenGuide,
}: {
  initialArticle?: string
  onOpenGuide: (guide: 'entrance' | 'craftsman-guide' | 'tutorial') => void
}) {
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

        {/* はじめ方（入口・チュートリアル）はここから開き直せる */}
        <p className="mb-1 mt-3 border-t border-stone-200 pt-3 text-xs font-semibold text-stone-500">
          はじめ方をもう一度
        </p>
        <button
          type="button"
          onClick={() => onOpenGuide('entrance')}
          className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-stone-100"
        >
          入口をやり直す（職人/店子）
        </button>
        <button
          type="button"
          onClick={() => onOpenGuide('craftsman-guide')}
          className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-stone-100"
        >
          職人のはじめ方
        </button>
        <button
          type="button"
          onClick={() => onOpenGuide('tutorial')}
          className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-stone-100"
        >
          店子のはじめ方
        </button>
      </nav>
      {current === 'progress' ? (
        <div className="min-w-0 flex-1">
          <ProgressView />
        </div>
      ) : (
        <article
          className="nb-panel help-article min-w-0 flex-1 p-6 text-sm leading-relaxed"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(articleSource(current)) }}
        />
      )}
    </div>
  )
}
