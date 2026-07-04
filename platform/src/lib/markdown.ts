// 依存なしの軽量 Markdown レンダラー（回覧板・案内所用）。
// 対応: 見出し(#〜###) / 箇条書き(-) / 段落 / **太字** / `code` / [text](https://…)
// 必ず HTML エスケープしてから変換する（本文は admin 投稿・リポジトリ内 md のみだが二重防衛）。

function escapeHtml(source: string): string {
  return source
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function inline(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer" class="underline">$1</a>',
    )
}

export function renderMarkdown(source: string): string {
  const lines = escapeHtml(source).split(/\r?\n/)
  const html: string[] = []
  let paragraph: string[] = []
  let inList = false

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      html.push(`<p>${inline(paragraph.join('<br/>'))}</p>`)
      paragraph = []
    }
  }
  const closeList = () => {
    if (inList) {
      html.push('</ul>')
      inList = false
    }
  }

  for (const line of lines) {
    const heading = line.match(/^(#{1,3})\s+(.*)$/)
    const listItem = line.match(/^[-*]\s+(.*)$/)
    if (heading) {
      flushParagraph()
      closeList()
      const level = heading[1].length
      html.push(`<h${level + 1}>${inline(heading[2])}</h${level + 1}>`) // h2〜h4
    } else if (listItem) {
      flushParagraph()
      if (!inList) {
        html.push('<ul>')
        inList = true
      }
      html.push(`<li>${inline(listItem[1])}</li>`)
    } else if (line.trim() === '') {
      flushParagraph()
      closeList()
    } else {
      paragraph.push(line)
    }
  }
  flushParagraph()
  closeList()
  return html.join('\n')
}
