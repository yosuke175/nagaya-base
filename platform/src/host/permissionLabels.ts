import type { GadgetPermission } from 'gadget-sdk'

// User-facing wording defined in docs/gadget-spec.md §5 — shown both in the
// catalog (FR-03) and in the install-approval card (FR-06).
export const PERMISSION_LABELS: Record<GadgetPermission, string> = {
  storage: 'このガジェット専用の保存領域を使用します',
  notify: '通知を表示することがあります',
  profile: 'あなたの表示名を取得します',
  microphone: 'マイクを使用することがあります（音声入力）',
  ai: 'AI による文章生成を利用します（あなたが登録した AI の API キーの利用量を消費します）',
}
