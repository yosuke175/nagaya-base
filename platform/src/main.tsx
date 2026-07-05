import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { appConfig } from './config'
import { applyTheme, loadTheme } from './theme'
import './index.css'

document.title = appConfig.appName
applyTheme(loadTheme())

// Service Worker 登録。registerType:'autoUpdate' なので新しいデプロイを見つけたら
// 自動で新SWを有効化し、最新に切り替える。加えて、古いキャッシュで固まらないよう、
// 起動直後・タブに戻ったとき・定期的に更新を確認しに行く（reload/ログインで最新化）。
const SW_UPDATE_INTERVAL_MS = 60 * 1000
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    void registration.update()
    setInterval(() => void registration.update(), SW_UPDATE_INTERVAL_MS)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void registration.update()
    })
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
