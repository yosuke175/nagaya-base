import { describe, expect, it } from 'vitest'
import { actionLabel, parseGuideReply } from './guideActions'

describe('parseGuideReply', () => {
  it('returns null action when no block', () => {
    const r = parseGuideReply('道具市から選んでインストールできます。')
    expect(r.action).toBeNull()
    expect(r.text).toBe('道具市から選んでインストールできます。')
  })

  it('extracts an install action and strips the block', () => {
    const reply =
      'スケジュール秘書を入れてみましょう。\n```nagaya-action\n{"type":"install","gadgetId":"schedule-secretary"}\n```'
    const r = parseGuideReply(reply)
    expect(r.action).toEqual({ type: 'install', gadgetId: 'schedule-secretary' })
    expect(r.text).toBe('スケジュール秘書を入れてみましょう。')
  })

  it('maps a Japanese view alias to the internal view id', () => {
    const r = parseGuideReply('```nagaya-action\n{"type":"open","view":"道具市"}\n```')
    expect(r.action).toEqual({ type: 'open', view: 'catalog' })
  })

  it('accepts ai-settings and help', () => {
    expect(parseGuideReply('```nagaya-action\n{"type":"ai-settings"}\n```').action).toEqual({
      type: 'ai-settings',
    })
    expect(parseGuideReply('```nagaya-action\n{"type":"help","article":"05-ai"}\n```').action).toEqual(
      { type: 'help', article: '05-ai' },
    )
  })

  it('rejects unknown views, bad gadget ids, and malformed json', () => {
    expect(parseGuideReply('```nagaya-action\n{"type":"open","view":"admin"}\n```').action).toBeNull()
    expect(
      parseGuideReply('```nagaya-action\n{"type":"install","gadgetId":"BAD ID!"}\n```').action,
    ).toBeNull()
    expect(parseGuideReply('```nagaya-action\n{not json}\n```').action).toBeNull()
  })

  it('labels actions in the world-view vocabulary', () => {
    expect(actionLabel({ type: 'open', view: 'catalog' })).toBe('道具市を開く')
    expect(actionLabel({ type: 'ai-settings' })).toBe('AI設定を開く')
  })
})
