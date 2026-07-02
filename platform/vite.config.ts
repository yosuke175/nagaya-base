import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { buildGadgetCsp, manifestConnectSrc } from './src/host/csp'

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

  // connect-src entries a gadget declared via manifest.externalServices
  // (empty on any read/parse problem — the CSP then stays fully closed)
  const readGadgetConnectSrc = (gadgetDir: string): string[] => {
    try {
      const manifestPath = path.join(gadgetsRoot, gadgetDir, 'manifest.json')
      return manifestConnectSrc(JSON.parse(fs.readFileSync(manifestPath, 'utf8')))
    } catch {
      return []
    }
  }

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
            const gadgetDir = relativePath.split('/')[0]
            res.setHeader(
              'Content-Security-Policy',
              buildGadgetCsp(origin, readGadgetConnectSrc(gadgetDir)),
            )
          }
          res.end(fs.readFileSync(filePath))
          return
        }

        next()
      })
    },
    // On production build, copy the SDK bundle and gadget assets into dist/
    // so they are served from the same paths as in dev (/sdk/gadget-sdk.js,
    // /gadgets/...). The CORS/CSP headers these paths need on Cloudflare
    // Pages live in public/_headers.
    closeBundle() {
      const outDir = path.join(platformDir, 'dist')
      if (!fs.existsSync(outDir)) return
      if (!fs.existsSync(sdkBundle)) {
        throw new Error('gadget-sdk is not built. Run: npm run build --workspace gadget-sdk')
      }
      fs.mkdirSync(path.join(outDir, 'sdk'), { recursive: true })
      fs.copyFileSync(sdkBundle, path.join(outDir, 'sdk', 'gadget-sdk.js'))
      fs.cpSync(gadgetsRoot, path.join(outDir, 'gadgets'), { recursive: true })

      // Append one CSP rule per gadget to the Cloudflare Pages _headers file
      // (the base file in public/ carries the CORS rules). connect-src is
      // widened only with each gadget's own declared baseUrls.
      const headerLines: string[] = []
      for (const entry of fs.readdirSync(gadgetsRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        headerLines.push(
          '',
          `/gadgets/${entry.name}/*`,
          `  Content-Security-Policy: ${buildGadgetCsp("'self'", readGadgetConnectSrc(entry.name))}`,
        )
      }
      fs.appendFileSync(path.join(outDir, '_headers'), headerLines.join('\n') + '\n')
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
