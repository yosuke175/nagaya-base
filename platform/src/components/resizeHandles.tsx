import type { PointerEvent as ReactPointerEvent } from 'react'
import type { WinRect } from '../host/gadgetLayout'

// 4辺4角のリサイズハンドル（ふつうの窓と同じ操作感）。フローティング窓（棚のガジェット・
// 案内AI）で共有する。ハンドルはほぼ透明で、縁に触れるとカーソルが変わる方式。

export type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const CURSOR: Record<ResizeDir, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
}

export function cursorForDir(dir: ResizeDir): string {
  return CURSOR[dir]
}

/** ドラッグ量(dx,dy)を、掴んだ辺/角の向き(dir)に応じて矩形へ反映（最小サイズ・画面外を考慮）。 */
export function computeResize(
  o: WinRect,
  dir: ResizeDir,
  dx: number,
  dy: number,
  minW: number,
  minH: number,
): WinRect {
  let { x, y, w, h } = o
  if (dir.includes('e')) w = Math.max(minW, o.w + dx)
  if (dir.includes('s')) h = Math.max(minH, o.h + dy)
  if (dir.includes('w')) {
    let nw = o.w - dx
    let nx = o.x + dx
    if (nw < minW) {
      nx = o.x + (o.w - minW)
      nw = minW
    }
    if (nx < 0) {
      nw = Math.max(minW, nw + nx)
      nx = 0
    }
    x = nx
    w = nw
  }
  if (dir.includes('n')) {
    let nh = o.h - dy
    let ny = o.y + dy
    if (nh < minH) {
      ny = o.y + (o.h - minH)
      nh = minH
    }
    if (ny < 0) {
      nh = Math.max(minH, nh + ny)
      ny = 0
    }
    y = ny
    h = nh
  }
  return { x, y, w, h }
}

const HANDLES: Array<{ dir: ResizeDir; className: string }> = [
  { dir: 'n', className: 'left-2 right-2 top-0 h-1.5 cursor-ns-resize' },
  { dir: 's', className: 'left-2 right-2 bottom-0 h-1.5 cursor-ns-resize' },
  { dir: 'w', className: 'top-2 bottom-2 left-0 w-1.5 cursor-ew-resize' },
  { dir: 'e', className: 'top-2 bottom-2 right-0 w-1.5 cursor-ew-resize' },
  { dir: 'nw', className: 'top-0 left-0 h-2.5 w-2.5 cursor-nwse-resize' },
  { dir: 'ne', className: 'top-0 right-0 h-2.5 w-2.5 cursor-nesw-resize' },
  { dir: 'sw', className: 'bottom-0 left-0 h-2.5 w-2.5 cursor-nesw-resize' },
  { dir: 'se', className: 'bottom-0 right-0 h-2.5 w-2.5 cursor-nwse-resize' },
]

/** 8方向のリサイズハンドルをまとめて描く。onStart(dir, e) で親がリサイズ開始。 */
export function ResizeHandles({ onStart }: { onStart: (dir: ResizeDir, e: ReactPointerEvent) => void }) {
  return (
    <>
      {HANDLES.map(({ dir, className }) => (
        <div
          key={dir}
          onPointerDown={(e) => onStart(dir, e)}
          title="サイズ変更"
          className={`absolute z-10 ${className}`}
          // 右下角だけ、掴める目印を薄く出す（他は透明のカーソル領域）
          style={
            dir === 'se'
              ? {
                  background:
                    'linear-gradient(135deg, transparent 55%, var(--nb-navy) 55%, var(--nb-navy) 65%, transparent 65%, transparent 75%, var(--nb-navy) 75%, var(--nb-navy) 85%, transparent 85%)',
                }
              : undefined
          }
        />
      ))}
    </>
  )
}
