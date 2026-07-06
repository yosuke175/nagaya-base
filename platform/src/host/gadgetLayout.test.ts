import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalStorageStub } from '../testing/localStorageStub'
import {
  centerFromRect,
  clearLayouts,
  loadLayouts,
  loadLayoutsRaw,
  rectFromCenter,
  saveLayout,
  saveLayoutRaw,
} from './gadgetLayout'

// 位置は「画面中央からのオフセット」で保存する。ブラウザ幅を変えても、窓の
// 中央に対する相対位置が保たれることを確認する（左上原点だと崩れていた問題）。

beforeEach(() => {
  vi.stubGlobal('localStorage', new LocalStorageStub())
})

describe('gadgetLayout: 中央基準の保存・復元', () => {
  it('保存時と同じ幅で読み込むと元の絶対座標に戻る', () => {
    saveLayout('gadget-a', { x: 700, y: 50, w: 380, h: 300 }, 1000)
    const loaded = loadLayouts(1000)
    expect(loaded['gadget-a']).toEqual({ x: 700, y: 50, w: 380, h: 300 })
  })

  it('幅を変えて読み込むと、中央からのオフセット分だけ平行移動する', () => {
    // 幅1000・中央500 のとき x=700（中央+200）で保存
    saveLayout('gadget-a', { x: 700, y: 50, w: 380, h: 300 }, 1000)
    // 幅2000・中央1000 で読むと、x=1000+200=1200 になる（中央基準の位置関係を維持）
    const loaded = loadLayouts(2000)
    expect(loaded['gadget-a']).toEqual({ x: 1200, y: 50, w: 380, h: 300 })
  })

  it('中央より左（オフセット負）の窓も同様に平行移動する', () => {
    saveLayout('gadget-a', { x: 100, y: 0, w: 200, h: 100 }, 1000) // 中央500 → cx=-400
    const loaded = loadLayouts(600) // 中央300 → x=300-400=-100
    expect(loaded['gadget-a'].x).toBe(-100)
  })

  it('clearLayouts はすべて消す', () => {
    saveLayout('gadget-a', { x: 0, y: 0, w: 100, h: 100 }, 1000)
    clearLayouts()
    expect(loadLayouts(1000)).toEqual({})
  })

  it('壊れた/古い形式のデータは無視する', () => {
    localStorage.setItem('gadget-layouts', JSON.stringify({ old: { x: 1, y: 2, w: 3, h: 4 } }))
    expect(loadLayouts(1000)).toEqual({})
  })
})

describe('gadgetLayout: 描画時に毎回変換する生のAPI（rectFromCenter/centerFromRect）', () => {
  it('centerFromRect と rectFromCenter は互いに逆変換になる', () => {
    const rect = { x: 700, y: 50, w: 380, h: 300 }
    const center = centerFromRect(rect, 1000)
    expect(rectFromCenter(center, 1000)).toEqual(rect)
  })

  it('同じ center を別の幅で変換すると、中央基準の位置関係を保って平行移動する', () => {
    const center = centerFromRect({ x: 700, y: 50, w: 380, h: 300 }, 1000) // cx=200
    expect(rectFromCenter(center, 2000)).toEqual({ x: 1200, y: 50, w: 380, h: 300 })
  })

  it('loadLayoutsRaw/saveLayoutRaw は中央基準の生データをそのまま保存・復元する', () => {
    const center = { cx: 200, y: 50, w: 380, h: 300 }
    saveLayoutRaw('gadget-a', center)
    expect(loadLayoutsRaw()['gadget-a']).toEqual(center)
  })

  it('saveLayout(絶対座標) と saveLayoutRaw(中央基準) は同じ結果になる', () => {
    saveLayout('a', { x: 700, y: 50, w: 380, h: 300 }, 1000)
    saveLayoutRaw('b', centerFromRect({ x: 700, y: 50, w: 380, h: 300 }, 1000))
    const raw = loadLayoutsRaw()
    expect(raw['a']).toEqual(raw['b'])
  })
})
