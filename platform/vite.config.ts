import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const platformDir = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = path.resolve(platformDir, '..')

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

/**
 * Dev-only host for gadget assets and the SDK bundle.
 *
 * Serves:
 * - /sdk/gadget-sdk.js  -> packages/gadget-sdk/dist/index.js
 * - /gadgets/<dir>/...  -> gadgets/<dir>/...
 *
 * Sandboxed gadget iframes have an opaque origin (ADR-001), so their module
 * imports arrive as CORS requests with `Origin: null` — hence the
 * `Access-Control-Allow-Origin: *` on these read-only public assets.
 * Gadget HTML gets a restrictive CSP; `baseUrl`s of declared externalServices
 * will be appended to connect-src in a later iteration (BYOK).
 */
function gadgetDevHost(): Plugin {
  const sdkBundle = path.join(repoRoot, 'packages', 'gadget-sdk', 'dist', 'index.js')
  const gadgetsRoot = path.join(repoRoot, 'gadgets')

  return {
    name: 'gadget-dev-host',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0]

        if (url === '/sdk/gadget-sdk.js') {
          if (!fs.existsSync(sdkBundle)) {
            res.statusCode = 503
            res.setHeader('Content-Type', CONTENT_TYPES['.js'])
            res.end('// gadget-sdk is not built. Run: npm run build --workspace gadget-sdk')
            return
          }
          res.setHeader('Content-Type', CONTENT_TYPES['.js'])
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.end(fs.readFileSync(sdkBundle))
          return
        }

        if (url.startsWith('/gadgets/')) {
          const relativePath = decodeURIComponent(url.slice('/gadgets/'.length))
          const filePath = path.resolve(gadgetsRoot, relativePath)
          if (!filePath.startsWith(gadgetsRoot + path.sep)) {
            res.statusCode = 403
            res.end('forbidden')
            return
          }
          if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            res.statusCode = 404
            res.end('not found')
            return
          }
          const ext = path.extname(filePath).toLowerCase()
          res.setHeader('Content-Type', CONTENT_TYPES[ext] ?? 'application/octet-stream')
          res.setHeader('Access-Control-Allow-Origin', '*')
          if (ext === '.html') {
            const origin = `http://${req.headers.host ?? 'localhost'}`
            res.setHeader(
              'Content-Security-Policy',
              [
                "default-src 'none'",
                `script-src 'unsafe-inline' ${origin}`,
                `style-src 'unsafe-inline' ${origin}`,
                `img-src ${origin} data:`,
                `connect-src ${origin}`,
              ].join('; '),
            )
          }
          res.end(fs.readFileSync(filePath))
          return
        }

        next()
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, platformDir)
  // The platform name is provisional — never hardcoded, always from
  // configuration (docs/requirements.md §0).
  const appName = env.VITE_APP_NAME || 'Gadget Platform (dev)'

  return {
    // Allow launchers/CI to assign the dev port via PORT (default: 5173)
    server: {
      port: Number(process.env.PORT) || 5173,
    },
    plugins: [
      react(),
      tailwindcss(),
      gadgetDevHost(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'script',
        manifest: {
          name: appName,
          short_name: appName,
          description: 'ガジェットを組み合わせて使えるダッシュボード',
          display: 'standalone',
          lang: 'ja',
          theme_color: '#44403c',
          background_color: '#f5f5f4',
          icons: [
            { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          ],
        },
      }),
    ],
  }
})
