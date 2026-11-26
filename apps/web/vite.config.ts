import react from '@vitejs/plugin-react'
import type { IncomingMessage } from 'node:http'
import net from 'node:net'
import type { Duplex } from 'node:stream'
import { defineConfig, type Plugin } from 'vite'

// 개발(pnpm dev)은 서버 8130·화면 5173, 실사용(pnpm start)은 서버 8131·화면 5174.
// 둘을 동시에 띄워도 부딪히지 않는다.
const apiPort = process.env.RW_API_PORT ?? '8130'

// 번들 나누기 (2026-10-15 종합 검토 묶음 D). 앱이 합칠 때마다 자동 업데이트되므로,
// 바뀌지 않는 라이브러리를 우리 코드와 다른 파일에 두어 업데이트 뒤에도 브라우저 캐시가 남게 한다.
// pdfjs는 pdfjs.ts가 처음 PDF를 그릴 때 따로 받으므로 여기서 다루지 않는다(그대로 자기 파일).
const VENDOR_CHUNKS: [name: string, match: RegExp][] = [
  ['react', /node_modules\/(\.pnpm\/[^/]*\/node_modules\/)?(react|react-dom|scheduler)\//],
  ['editor', /node_modules\/(\.pnpm\/[^/]*\/node_modules\/)?(@codemirror|@lezer|@marijn|style-mod|w3c-keyname|crelt)\//],
  ['katex', /node_modules\/(\.pnpm\/[^/]*\/node_modules\/)?katex\//],
  ['markdown', /node_modules\/(\.pnpm\/[^/]*\/node_modules\/)?(markdown-it|mdurl|uc\.micro|linkify-it|entities|punycode(\.js)?)\//],
]

/**
 * 예제 모드(pnpm dev)에서 서버 파일을 고치면 tsx watch가 백엔드를 다시 띄운다. 그 몇 초 동안 화면의 /api 요청이 502로 떨어지고
 * 실시간 알림 웹소켓이 연결에 실패했다 (11/26). 백엔드 포트가 다시 열릴 때까지 /api 요청과 웹소켓 연결을 잠깐 붙잡았다가 넘긴다.
 * 한도(8초)를 넘으면 전처럼 그대로 넘긴다. 백엔드가 죽는 순간에 가 있던 요청은 어쩔 수 없이 끊긴다. 실사용 앱은 이 프록시를 쓰지 않는다
 */
let apiProxy: { ws(req: IncomingMessage, socket: Duplex, head: Buffer): void } | undefined
function waitForBackend(port: number, limitMs = 8000): Plugin {
  const open = () => new Promise<boolean>((resolve) => {
    const s = net.connect(port, '127.0.0.1')
    s.once('connect', () => { s.destroy(); resolve(true) })
    s.once('error', () => resolve(false))
  })
  const ready = async () => { for (const end = Date.now() + limitMs; Date.now() < end && !(await open());) await new Promise((r) => setTimeout(r, 100)) }
  const isApi = (url?: string) => !!url && (url === '/api' || url.startsWith('/api/') || url.startsWith('/api?'))
  return {
    name: 'rw-wait-for-backend',
    apply: 'serve',
    configureServer(server) {
      // 여기서 더한 미들웨어는 Vite의 프록시보다 먼저 돈다
      server.middlewares.use((req, _res, next) => { if (isApi(req.url)) void ready().then(() => next()); else next() })
      // 웹소켓은 미들웨어를 지나지 않는다: 프록시의 ws를 끄고(아래 ws: false) 여기서 기다렸다가 넘긴다. Vite 자신의 웹소켓(HMR)은 /api가 아니라 건드리지 않는다
      server.httpServer?.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => { if (isApi(req.url)) void ready().then(() => { if (!socket.destroyed) apiProxy?.ws(req, socket, head) }) })
    },
  }
}

export default defineConfig({
  plugins: [react(), waitForBackend(Number(apiPort))],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{
            name(id) {
              if (!id.includes('node_modules') || id.includes('pdfjs-dist')) return null
              return VENDOR_CHUNKS.find(([, m]) => m.test(id))?.[0] ?? 'vendor'
            },
          }],
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: `http://127.0.0.1:${apiPort}`, ws: false, configure: (proxy) => { apiProxy = proxy } } },
  },
})
