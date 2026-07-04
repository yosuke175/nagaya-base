// 依存なしの軽量 Markdown レンダラー（回覧板・案内所用）。
// 対応: 見出し(#〜###) / 箇条書き(-) / 表(| … |) / 段落 / **太字** / `code` / [text](https://…)
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

  const isTableRow = (text: string) => /^\|(.+)\|\s*$/.test(text)
  const isTableSeparator = (text: string) => /^\|[\s:|-]+\|\s*$/.test(text)
  const cells = (row: string) =>
    row
      .replace(/^\||\|\s*$/g, '')
      .split('|')
      .map((cell) => cell.trim())

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // 表: ヘッダ行 + 区切り行(|---|---|) + 本文行
    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      flushParagraph()
      closeList()
      const header = cells(line)
      const body: string[][] = []
      i += 2
      while (i < lines.length && isTableRow(lines[i])) {
        body.push(cells(lines[i]))
        i++
      }
      i-- // for ループの ++ を相殺
      const head = header.map((cell) => `<th>${inline(cell)}</th>`).join('')
      const rowsHtml = body
        .map((cellRow) => `<tr>${cellRow.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`)
        .join('')
      html.push(`<table><thead><tr>${head}</tr></thead><tbody>${rowsHtml}</tbody></table>`)
      continue
    }
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
