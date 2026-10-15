import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

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

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules') || id.includes('pdfjs-dist')) return undefined
          return VENDOR_CHUNKS.find(([, m]) => m.test(id))?.[0] ?? 'vendor'
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: `http://127.0.0.1:${apiPort}`, ws: true } },
  },
})
