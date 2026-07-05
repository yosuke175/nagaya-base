// 工房「道具づくり」の AI 指示文テンプレート。
// 工房は Web なのでローカルにファイルは作れない → 職人が Claude Code 等に貼り付ける
// 「指示文」を用意する（実作成・改修は PC のリポジトリ側で AI と一緒に行う）。

export interface GadgetIdea {
  key: string
  name: string
  desc: string
  idea: string
}

// セットアップウィザードにあった「お題」をそのまま踏襲。
export const GADGET_IDEAS: GadgetIdea[] = [
  { key: 'omikuji', name: 'おみくじ', desc: '押すと今日の運勢が出る', idea: 'ボタンを押すと今日の運勢とひとことアドバイスを表示するおみくじ' },
  { key: 'today-three', name: '今日の3つ', desc: '今日やる3つだけのToDo', idea: '今日やることを3つだけ書いて、終えたら消せる小さなToDo' },
  { key: 'prompt-book', name: 'プロンプト帳', desc: '推しプロンプトを保存', idea: 'お気に入りのAIプロンプトを保存して、ワンタップでコピーできるプロンプト帳' },
  { key: 'unit-convert', name: '単位変換', desc: '坪⇔m² などをさっと変換', idea: '坪⇔平米、寸⇔cmなど、よく使う単位をさっと変換する道具' },
  { key: 'blank', name: '白紙', desc: '自分のアイデアで作る', idea: '' },
]

const RULES = [
  '制約: docs/gadget-spec.md の仕様を厳守すること',
  '- プラットフォームとの通信は gadget-sdk（postMessage API）のみ',
  '- manifest.json で宣言した permissions 以外の SDK 機能は使わない',
  '- 外部サービスと通信する場合は externalServices の宣言が必要',
].join('\n')

/** 新しい道具をゼロから作る指示文（雛形を複製してから作り込む）。 */
export function newToolPrompt(id: string, idea: string): string {
  const safeId = id || '<あなたのID>'
  return (
    'docs/gadget-spec.md と gadgets/_template/ の雛形を読んでください。\n' +
    `まず \`cp -r gadgets/_template gadgets/${safeId}\`` +
    `（Windows は \`xcopy /E /I gadgets\\_template gadgets\\${safeId}\`）で雛形を複製し、\n` +
    `gadgets/${safeId}/manifest.json の id を「${safeId}」に、name を表示名に書き換えてください。\n` +
    'そのうえで、次のアイデアの道具（ガジェット）に作り込んでください。\n\n' +
    `アイデア: ${idea || '（ここに作りたいものを書く）'}\n\n` +
    RULES
  )
}

/** 既存の道具を改善する指示文。 */
export function improveToolPrompt(id: string): string {
  return (
    `gadgets/${id}/ の実装と manifest.json を読んでください。\n` +
    '次の点を改善してください:\n（ここに直したいこと・足したい機能を書く）\n\n' +
    RULES
  )
}

/** 既存の道具を土台に、新しい道具を作る（複製して改造）指示文。 */
export function duplicateToolPrompt(id: string, newId: string): string {
  const safeNew = newId || `${id}-2`
  return (
    `gadgets/${id}/ を土台に、gadgets/${safeNew}/ として新しい道具を作ってください。\n` +
    `まず \`cp -r gadgets/${id} gadgets/${safeNew}\`` +
    `（Windows は \`xcopy /E /I gadgets\\${id} gadgets\\${safeNew}\`）で複製し、\n` +
    `gadgets/${safeNew}/manifest.json の id を「${safeNew}」に書き換えてください。\n` +
    'そのうえで、次の点を変えてください:\n（ここに変更したいことを書く）\n\n' +
    RULES
  )
}
