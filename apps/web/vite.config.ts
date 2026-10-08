import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 개발(pnpm dev)은 서버 8130·화면 5173, 실사용(pnpm start)은 서버 8131·화면 5174.
// 둘을 동시에 띄워도 부딪히지 않는다.
const apiPort = process.env.RW_API_PORT ?? '8130'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: `http://127.0.0.1:${apiPort}`, ws: true } },
  },
})
