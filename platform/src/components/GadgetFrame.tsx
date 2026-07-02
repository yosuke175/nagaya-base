import { useEffect, useRef, useState } from 'react'
import type { GadgetManifest, GadgetSize } from 'gadget-sdk'
import { createGadgetHost, gadgetEntryUrl, loadGadgetManifest } from '../host/gadgetHost'

const SIZE_CLASSES: Record<GadgetSize, string> = {
  small: 'col-span-1 min-h-48',
  medium: 'col-span-2 min-h-48',
  large: 'col-span-2 min-h-96',
  full: 'col-span-full min-h-96',
}

interface GadgetFrameProps {
  /** Directory name under gadgets/ */
  gadgetDir: string
}

export function GadgetFrame({ gadgetDir }: GadgetFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [manifest, setManifest] = useState<GadgetManifest | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setManifest(null)
    setError(null)
    loadGadgetManifest(gadgetDir)
      .then((loaded) => {
        if (!cancelled) setManifest(loaded)
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message)
      })
    return () => {
      cancelled = true
    }
  }, [gadgetDir])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!manifest || !iframe) return
    const host = createGadgetHost(iframe, manifest)
    return () => host.dispose()
  }, [manifest])

  if (error) {
    return (
      <section className="col-span-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        ガジェット「{gadgetDir}」を読み込めませんでした: {error}
      </section>
    )
  }

  if (!manifest) {
    return (
      <section className="col-span-2 min-h-48 animate-pulse rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-400">
        読み込み中…
      </section>
    )
  }

  return (
    <section
      className={`flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm ${SIZE_CLASSES[manifest.size.default]}`}
    >
      <header className="flex items-baseline justify-between border-b border-stone-100 px-3 py-2">
        <h2 className="text-sm font-semibold">{manifest.name}</h2>
        <span className="text-xs text-stone-400">v{manifest.version}</span>
      </header>
      {/*
        ADR-001: gadgets are isolated with sandbox="allow-scripts" ONLY.
        Never add allow-same-origin, and never pass user tokens to the frame.
      */}
      <iframe
        ref={iframeRef}
        src={gadgetEntryUrl(gadgetDir, manifest)}
        sandbox="allow-scripts"
        title={manifest.name}
        className="w-full flex-1 border-0"
      />
      <footer className="border-t border-stone-100 px-3 py-1.5 text-xs text-stone-400">
        権限: {manifest.permissions.length > 0 ? manifest.permissions.join(', ') : 'なし'}
      </footer>
    </section>
  )
}
