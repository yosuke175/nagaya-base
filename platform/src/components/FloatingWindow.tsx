import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { GadgetFrame } from './GadgetFrame'
import { ResizeHandles, computeResize, cursorForDir, type ResizeDir } from './resizeHandles'
import type { CenterRect, WinRect } from '../host/gadgetLayout'

// 棚のフローティング窓。ヘッダーをドラッグで移動、4辺4角のハンドルでリサイズ。
// ドラッグ/リサイズ中は全面シールドを敷いて iframe にイベントを奪われないようにする。
//
// 位置は「静止時はCSSの calc(50% + cxpx) で置く」「ドラッグ中だけJSの絶対座標で動かす」
// の二枚構成にしている。ブラウザのリサイズに合わせて毎回JSで絶対座標を計算し直す方式
// （以前の実装）だと、リサイズの描画→ワンテンポ遅れてJSが位置を補正、を繰り返すことになり
// 見た目がガタつく（案内AI窓も同じ仕組みにしたところ同様にガタついた＝JS側の計算方式に
// 起因すると確認済み）。calc()はブラウザのレイアウトエンジンがネイティブに追従するので
// JSの介在が無く、リサイズ中もガタつかない。
//
// ドラッグ開始/終了の変換は、ビューポート幅からの計算(rectFromCenter/centerFromRect)を
// やめ、**実際に描画されているDOMを直接測る**方式にした。containing block（position:relative
// の親=棚の.relative）を getBoundingClientRect() で測り、その中心を基準にする。ビューポート幅
// 経由の再計算だと、100vw・パディング・スクロールバー等の重なりでCSSの実際の解決結果と
// 数px単位でズレる余地があり、それが「掴む/離す瞬間に一瞬ズレる」不具合の原因だった。
// DOMを直接測れば、CSSが実際に使っている値そのものなのでズレようがない。
//
// 重要: getBoundingClientRect() は「ビューポート基準」（スクロール量を含む）の座標を返すが、
// position:absolute の top/left は「containing block（position:relative の親）基準」の座標。
// この2つの座標系は、containing block 自身がビューポート内のどこにあるか（＝スクロール量ぶん
// ズレる）だけ食い違う。measureRect はこの食い違いを containing block の位置を差し引くことで
// 補正している（差し引かずに使うと、ページがスクロールしている分だけ縦に大きくズレる）。

const MIN_W = 240
const MIN_H = 180

/**
 * 要素の現在位置を、containing block（position:relative の親）基準の座標として読み取る。
 * position:absolute の top/left にそのまま使える値になる。
 */
function measureRect(el: HTMLElement): WinRect {
  const r = el.getBoundingClientRect()
  const parent = el.offsetParent as HTMLElement | null
  if (!parent) return { x: r.left, y: r.top, w: r.width, h: r.height }
  const p = parent.getBoundingClientRect()
  return { x: r.left - p.left, y: r.top - p.top, w: r.width, h: r.height }
}

/**
 * containing block 基準の x（measureRect が返す座標系）を、その中心を基準にした cx に変換する。
 */
function toCenterOffset(el: HTMLElement, localX: number): number {
  const parent = el.offsetParent as HTMLElement | null
  const width = parent ? parent.getBoundingClientRect().width : document.documentElement.clientWidth
  return localX - width / 2
}

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
  const containerRef = useRef<HTMLDivElement>(null)
  // ドラッグ/リサイズ中だけ使う絶対座標のワーキングコピー。null=静止（CSS calc()で描画）
  const [dragLocal, setDragLocal] = useState<WinRect | null>(null)

  const drag = useRef<
    null | { mode: 'move' | 'resize'; dir?: ResizeDir; sx: number; sy: number; orig: WinRect }
  >(null)
  const [active, setActive] = useState<null | 'move' | ResizeDir>(null)

  const startMove = (e: ReactPointerEvent) => {
    // ヘッダー内のボタン（アンインストール等）を押したときはドラッグしない
    if ((e.target as HTMLElement).closest('button')) return
    if (!containerRef.current) return
    e.preventDefault()
    onFocus()
    const orig = measureRect(containerRef.current) // 今まさに描画されている位置をそのまま使う
    drag.current = { mode: 'move', sx: e.clientX, sy: e.clientY, orig }
    setDragLocal(orig)
    setActive('move')
  }
  const startResize = (dir: ResizeDir, e: ReactPointerEvent) => {
    if (!containerRef.current) return
    e.preventDefault()
    e.stopPropagation()
    onFocus()
    const orig = measureRect(containerRef.current)
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
    if (dragLocal && containerRef.current) {
      const cx = toCenterOffset(containerRef.current, dragLocal.x)
      onCommit({ cx, y: dragLocal.y, w: dragLocal.w, h: dragLocal.h })
    }
    setDragLocal(null)
  }

  const style = dragLocal
    ? { left: dragLocal.x, top: dragLocal.y, width: dragLocal.w, height: dragLocal.h, zIndex }
    : { left: `calc(50% + ${rect.cx}px)`, top: rect.y, width: rect.w, height: rect.h, zIndex }

  return (
    <div ref={containerRef} className="absolute" style={style} onPointerDown={onFocus}>
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
