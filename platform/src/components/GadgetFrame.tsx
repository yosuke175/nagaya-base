import { useEffect, useRef, useState } from 'react'
import {
  externalServiceBaseUrls,
  type GadgetExternalService,
  type GadgetManifest,
  type GadgetSize,
} from 'gadget-sdk'
import { getStoredApproval, isApprovalCurrent, saveApproval } from '../host/approvals'
import { PERMISSION_LABELS } from '../host/permissionLabels'
import {
  createGadgetHost,
  credentialStore,
  gadgetEntryUrl,
  loadGadgetManifest,
} from '../host/gadgetHost'

const SIZE_CLASSES: Record<GadgetSize, string> = {
  small: 'col-span-1 min-h-48',
  medium: 'col-span-2 min-h-48',
  large: 'col-span-2 min-h-96',
  full: 'col-span-full min-h-96',
}

interface GadgetFrameProps {
  /** Directory name under gadgets/ */
  gadgetDir: string
  /** 棚での「アンインストール」ボタン用（渡されたときだけ表示） */
  onUninstall?: (dir: string) => void
}

export function GadgetFrame({ gadgetDir, onUninstall }: GadgetFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [manifest, setManifest] = useState<GadgetManifest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [approved, setApproved] = useState(false)
  const [setupService, setSetupService] = useState<GadgetExternalService | null>(null)

  useEffect(() => {
    let cancelled = false
    setManifest(null)
    setError(null)
    setApproved(false)
    loadGadgetManifest(gadgetDir)
      .then((loaded) => {
        if (cancelled) return
        setManifest(loaded)
        setApproved(isApprovalCurrent(loaded, getStoredApproval(loaded.id)))
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
    if (!manifest || !approved || !iframe) return
    const host = createGadgetHost(iframe, manifest, {
      onRequestSetup: (service) => setSetupService(service),
    })
    return () => host.dispose()
  }, [manifest, approved])

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

  if (!approved) {
    return (
      <ApprovalCard
        manifest={manifest}
        onApprove={() => {
          saveApproval(manifest)
          setApproved(true)
        }}
      />
    )
  }

  const services = manifest.externalServices ?? []

  return (
    <section
      className={`relative flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm ${SIZE_CLASSES[manifest.size.default]}`}
    >
      <header className="flex items-baseline justify-between gap-2 border-b border-stone-100 px-3 py-2">
        <h2 className="text-sm font-semibold">{manifest.name}</h2>
        <span className="flex items-baseline gap-2">
          <span className="text-xs text-stone-400">v{manifest.version}</span>
          {onUninstall && (
            <button
              type="button"
              onClick={() => onUninstall(gadgetDir)}
              className="rounded border border-red-200 px-1.5 py-0.5 text-xs text-red-600 hover:bg-red-50"
            >
              アンインストール
            </button>
          )}
        </span>
      </header>
      {/*
        ADR-001: gadgets are isolated with sandbox="allow-scripts" ONLY.
        Never add allow-same-origin, and never pass user tokens to the frame.
        The microphone permission (approved above) is the single exception
        granted through the Permissions-Policy `allow` attribute.
      */}
      <iframe
        ref={iframeRef}
        src={gadgetEntryUrl(gadgetDir, manifest)}
        sandbox="allow-scripts"
        allow={manifest.permissions.includes('microphone') ? 'microphone' : undefined}
        title={manifest.name}
        className="w-full flex-1 border-0"
      />
      <footer className="flex items-center justify-between gap-2 border-t border-stone-100 px-3 py-1.5 text-xs text-stone-400">
        <span>権限: {manifest.permissions.length > 0 ? manifest.permissions.join(', ') : 'なし'}</span>
        {services.length > 0 && (
          <span className="flex gap-1">
            {services.map((service) => (
              <button
                key={service.id}
                type="button"
                onClick={() => setSetupService(service)}
                className="rounded border border-stone-200 px-1.5 py-0.5 text-stone-500 hover:bg-stone-50"
              >
                連携設定{services.length > 1 ? `（${service.id}）` : ''}
              </button>
            ))}
          </span>
        )}
      </footer>
      {setupService && (
        <CredentialDialog
          gadgetId={manifest.id}
          service={setupService}
          onClose={() => setSetupService(null)}
        />
      )}
    </section>
  )
}

/**
 * Minimal install-approval UI (FR-06): the user sees the declared
 * permissions and external services before the gadget is shown at all.
 */
function ApprovalCard({
  manifest,
  onApprove,
}: {
  manifest: GadgetManifest
  onApprove: () => void
}) {
  const services = manifest.externalServices ?? []
  return (
    <section
      className={`nb-panel flex flex-col overflow-hidden border ${SIZE_CLASSES[manifest.size.default]}`}
      style={{ borderColor: 'var(--nb-gold)' }}
    >
      <header className="border-b px-3 py-2" style={{ borderColor: 'var(--nb-gold)' }}>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--nb-navy)' }}>
          「{manifest.name}」を棚に並べる前に
        </h2>
      </header>
      <div className="flex-1 overflow-y-auto px-3 py-2 text-xs leading-relaxed text-stone-700">
        <p>{manifest.description}</p>
        <h3 className="mt-2 font-semibold">このガジェットに許可すること</h3>
        {manifest.permissions.length > 0 ? (
          <ul className="list-disc pl-4">
            {manifest.permissions.map((permission) => (
              <li key={permission}>{PERMISSION_LABELS[permission] ?? permission}</li>
            ))}
          </ul>
        ) : (
          <p>権限の要求はありません</p>
        )}
        {services.length > 0 && (
          <>
            <h3 className="mt-2 font-semibold">外部サービス連携（あなた自身のキーで接続）</h3>
            {services.map((service) => (
              <div key={service.id} className="mt-1">
                <p className="font-medium">{service.name}</p>
                <p>{service.purpose}</p>
                <p className="text-stone-500">通信先: {externalServiceBaseUrls(service).join(' , ')}</p>
              </div>
            ))}
          </>
        )}
      </div>
      <footer className="border-t px-3 py-2" style={{ borderColor: 'var(--nb-gold)' }}>
        <button
          type="button"
          onClick={onApprove}
          className="btn-primary rounded-lg px-3 py-1.5 text-xs font-medium"
        >
          上記を承認して表示する
        </button>
      </footer>
    </section>
  )
}

/** Credential settings for one external service (BYOK, ADR-005 mock). */
function CredentialDialog({
  gadgetId,
  service,
  onClose,
}: {
  gadgetId: string
  service: GadgetExternalService
  onClose: () => void
}) {
  const [value, setValue] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void credentialStore.get(gadgetId, service.id).then((stored) => {
      if (!cancelled && stored) setValue(stored)
    })
    return () => {
      cancelled = true
    }
  }, [gadgetId, service.id])

  const save = async () => {
    const trimmed = value.trim()
    if (!trimmed) return
    setError(null)
    try {
      await credentialStore.set(gadgetId, service.id, trimmed)
      setSaved(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const remove = async () => {
    setError(null)
    try {
      await credentialStore.remove(gadgetId, service.id)
      setValue('')
      setSaved(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <div className="absolute inset-0 z-10 flex flex-col gap-2 overflow-y-auto bg-white/95 p-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold">連携設定: {service.name}</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-stone-200 px-2 py-0.5 text-stone-500 hover:bg-stone-50"
        >
          閉じる
        </button>
      </div>
      <p className="text-stone-600">{service.purpose}</p>
      <p className="text-stone-400">通信先: {externalServiceBaseUrls(service).join(' , ')}</p>
      {service.setupUrl && (
        <a
          href={service.setupUrl}
          target="_blank"
          rel="noreferrer"
          className="font-medium underline"
          style={{ color: 'var(--nb-terra)' }}
        >
          設定手順を開く（別タブ）
        </a>
      )}
      <label className="grid gap-1">
        <span className="text-stone-600">
          クレデンシャル
          {service.setupHint ? '（下の形式で入力）' : '（入力する内容・形式はガジェットの説明に従ってください）'}
        </span>
        {service.setupHint && (
          <p className="rounded-lg bg-stone-100 p-2 text-stone-600">{service.setupHint}</p>
        )}
        <textarea
          value={value}
          onChange={(changeEvent) => {
            setValue(changeEvent.target.value)
            setSaved(false)
          }}
          rows={3}
          placeholder={service.setupHint ?? undefined}
          className="rounded-lg border border-stone-300 p-2 font-mono"
        />
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          className="btn-primary rounded-lg px-3 py-1.5 font-medium"
        >
          保存
        </button>
        <button
          type="button"
          onClick={() => void remove()}
          className="rounded-lg border border-red-200 px-3 py-1.5 text-red-700 hover:bg-red-50"
        >
          削除
        </button>
        {saved && (
          <span className="text-green-700">保存しました。ガジェット側で再確認してください</span>
        )}
      </div>
      {error && <p className="text-red-700">{error}</p>}
    </div>
  )
}
