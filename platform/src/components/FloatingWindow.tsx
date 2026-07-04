import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { GadgetFrame } from './GadgetFrame'
import type { WinRect } from '../host/gadgetLayout'

// 棚のフローティング窓。ヘッダーをドラッグで移動、右下ハンドルでリサイズ。
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

  const drag = useRef<null | { mode: 'move' | 'resize'; sx: number; sy: number; orig: WinRect }>(null)
  const [active, setActive] = useState<null | 'move' | 'resize'>(null)

  const startMove = (e: ReactPointerEvent) => {
    // ヘッダー内のボタン（アンインストール等）を押したときはドラッグしない
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    onFocus()
    drag.current = { mode: 'move', sx: e.clientX, sy: e.clientY, orig: local }
    setActive('move')
  }
  const startResize = (e: ReactPointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onFocus()
    drag.current = { mode: 'resize', sx: e.clientX, sy: e.clientY, orig: local }
    setActive('resize')
  }
  const onShieldMove = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    if (d.mode === 'move') {
      setLocal({ ...d.orig, x: Math.max(0, d.orig.x + dx), y: Math.max(0, d.orig.y + dy) })
    } else {
      setLocal({ ...d.orig, w: Math.max(MIN_W, d.orig.w + dx), h: Math.max(MIN_H, d.orig.h + dy) })
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
      {/* 右下のリサイズハンドル */}
      <div
        onPointerDown={startResize}
        title="サイズ変更"
        className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
        style={{
          background:
            'linear-gradient(135deg, transparent 55%, var(--nb-navy) 55%, var(--nb-navy) 65%, transparent 65%, transparent 75%, var(--nb-navy) 75%, var(--nb-navy) 85%, transparent 85%)',
        }}
      />
      {/* ドラッグ/リサイズ中の全面シールド（iframe のイベント奪取を防ぐ） */}
      {active && (
        <div
          className="fixed inset-0 z-[9999]"
          style={{ cursor: active === 'resize' ? 'nwse-resize' : 'move' }}
          onPointerMove={onShieldMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
        />
      )}
    </div>
  )
}
