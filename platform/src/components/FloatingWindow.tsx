import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { GadgetFrame } from './GadgetFrame'
import { ResizeHandles, computeResize, cursorForDir, type ResizeDir } from './resizeHandles'
import { centerFromRect, rectFromCenter, type CenterRect, type WinRect } from '../host/gadgetLayout'

// 棚のフローティング窓。ヘッダーをドラッグで移動、4辺4角のハンドルでリサイズ。
// ドラッグ/リサイズ中は全面シールドを敷いて iframe にイベントを奪われないようにする。
//
// 位置は「静止時はCSSの calc(50% + cxpx) で置く」「ドラッグ中だけJSの絶対座標で動かす」
// の二枚構成にしている。ブラウザのリサイズに合わせて毎回JSで絶対座標を計算し直す方式
// （以前の実装）だと、リサイズの描画→ワンテンポ遅れてJSが位置を補正、を繰り返すことになり
// 見た目がガタつく（案内AI窓も同じ仕組みにしたところ同様にガタついた＝JS側の計算方式に
// 起因すると確認済み）。calc()はブラウザのレイアウトエンジンがネイティブに追従するので
// JSの介在が無く、リサイズ中もガタつかない。

const MIN_W = 240
const MIN_H = 180

export function FloatingWindow({
  gadgetDir,
  rect,
  zIndex,
  onFocus,
  onCommit,
  onUninstall,
}: {
  gadgetDir: string
  /** 静止時の位置（画面中央からのオフセット）。ドラッグ中はここを見ない。 */
  rect: CenterRect
  zIndex: number
  onFocus: () => void
  onCommit: (rect: CenterRect) => void
  onUninstall: (dir: string) => void
}) {
  // ドラッグ/リサイズ中だけ使う絶対座標のワーキングコピー。null=静止（CSS calc()で描画）
  const [dragLocal, setDragLocal] = useState<WinRect | null>(null)

  const drag = useRef<
    null | { mode: 'move' | 'resize'; dir?: ResizeDir; sx: number; sy: number; orig: WinRect }
  >(null)
  const [active, setActive] = useState<null | 'move' | ResizeDir>(null)

  const startMove = (e: ReactPointerEvent) => {
    // ヘッダー内のボタン（アンインストール等）を押したときはドラッグしない
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    onFocus()
    const orig = rectFromCenter(rect, window.innerWidth)
    drag.current = { mode: 'move', sx: e.clientX, sy: e.clientY, orig }
    setDragLocal(orig)
    setActive('move')
  }
  const startResize = (dir: ResizeDir, e: ReactPointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onFocus()
    const orig = rectFromCenter(rect, window.innerWidth)
    drag.current = { mode: 'resize', dir, sx: e.clientX, sy: e.clientY, orig }
    setDragLocal(orig)
    setActive(dir)
  }
  const onShieldMove = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    if (d.mode === 'move') {
      setDragLocal({ ...d.orig, x: Math.max(0, d.orig.x + dx), y: Math.max(0, d.orig.y + dy) })
    } else if (d.dir) {
      setDragLocal(computeResize(d.orig, d.dir, dx, dy, MIN_W, MIN_H))
    }
  }
  const endDrag = () => {
    if (!drag.current) return
    drag.current = null
    setActive(null)
    if (dragLocal) onCommit(centerFromRect(dragLocal, window.innerWidth))
    setDragLocal(null)
  }

  const style = dragLocal
    ? { left: dragLocal.x, top: dragLocal.y, width: dragLocal.w, height: dragLocal.h, zIndex }
    : { left: `calc(50% + ${rect.cx}px)`, top: rect.y, width: rect.w, height: rect.h, zIndex }

  return (
    <div className="absolute" style={style} onPointerDown={onFocus}>
      <GadgetFrame
        gadgetDir={gadgetDir}
        floating
        onUninstall={onUninstall}
        onHeaderPointerDown={startMove}
      />
      {/* 4辺4角のリサイズハンドル */}
      <ResizeHandles onStart={startResize} />
      {/* ドラッグ/リサイズ中の全面シールド（iframe のイベント奪取を防ぐ） */}
      {active && (
        <div
          className="fixed inset-0 z-[9999]"
          style={{ cursor: active === 'move' ? 'move' : cursorForDir(active) }}
          onPointerMove={onShieldMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
        />
      )}
    </div>
  )
}
