import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { appConfig } from './config'
import { applyAccent, loadAccent } from './theme'
import './index.css'

document.title = appConfig.appName
applyAccent(loadAccent())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
