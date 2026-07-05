import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { GadgetFrame } from './GadgetFrame'
import { ResizeHandles, computeResize, cursorForDir, type ResizeDir } from './resizeHandles'
import type { WinRect } from '../host/gadgetLayout'

// 棚のフローティング窓。ヘッダーをドラッグで移動、4辺4角のハンドルでリサイズ。
// ドラッグ/リサイズ中は全面シールドを敷いて iframe にイベントを奪われないようにする。

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
  rect: WinRect
  zIndex: number
  onFocus: () => void
  onCommit: (rect: WinRect) => void
  onUninstall: (dir: string) => void
}) {
  const [local, setLocal] = useState<WinRect>(rect)
  // 親がレイアウトをリセット（整列）したら追従する
  useEffect(() => setLocal(rect), [rect.x, rect.y, rect.w, rect.h])

  const drag = useRef<
    null | { mode: 'move' | 'resize'; dir?: ResizeDir; sx: number; sy: number; orig: WinRect }
  >(null)
  const [active, setActive] = useState<null | 'move' | ResizeDir>(null)

  const startMove = (e: ReactPointerEvent) => {
    // ヘッダー内のボタン（アンインストール等）を押したときはドラッグしない
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    onFocus()
    drag.current = { mode: 'move', sx: e.clientX, sy: e.clientY, orig: local }
    setActive('move')
  }
  const startResize = (dir: ResizeDir, e: ReactPointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onFocus()
    drag.current = { mode: 'resize', dir, sx: e.clientX, sy: e.clientY, orig: local }
    setActive(dir)
  }
  const onShieldMove = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    if (d.mode === 'move') {
      setLocal({ ...d.orig, x: Math.max(0, d.orig.x + dx), y: Math.max(0, d.orig.y + dy) })
    } else if (d.dir) {
      setLocal(computeResize(d.orig, d.dir, dx, dy, MIN_W, MIN_H))
    }
  }
  const endDrag = () => {
    if (!drag.current) return
    drag.current = null
    setActive(null)
    onCommit(local)
  }

  return (
    <div
      className="absolute"
      style={{ left: local.x, top: local.y, width: local.w, height: local.h, zIndex }}
      onPointerDown={onFocus}
    >
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
